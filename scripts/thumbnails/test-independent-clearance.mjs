import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { verifyAttestation } from "./verify-independent-clearance.mjs";

const id=n=>"00000000-0000-4000-8000-"+n.toString(16).padStart(12,"0");
const sha256=data=>createHash("sha256").update(data).digest("hex");
function fixture(){
  const count=4647;
  const indexText=[
    "media_id,cover_inventory,qualified_content_review,approved_for_new_publication",
    ...Array.from({length:count},(_,i)=>{
      const cover=i<1001?"ORIGINAL_EXISTING_COVER":
        i<1030?"RECENTLY_PUBLISHED_COVER":"NEEDS_INDIVIDUAL_COVER";
      return [id(i+1),cover,"REVIEW_REQUIRED","false"].join(",");
    })
  ].join("\r\n")+"\r\n";
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  const reviewerPublicKeyPem=publicKey.export({type:"spki",format:"pem"});
  const trustedSpkiSha256=sha256(publicKey.export({type:"spki",format:"der"}));
  const manifest={
    schema:"jb-independent-clearance-v1",
    reviewer_org:"Independent Safety Team",
    reviewer_id:"verified-adult-moderator",
    completed_at:"2026-11-15T12:00:00Z",
    source_index_sha256:sha256(indexText),
    items:Array.from({length:count},(_,i)=>({
      media_id:id(i+1),
      decision:i===0?"APPROVED_NONEXPLICIT":i===1?"REJECT":"HOLD",
      reviewed_at:"2026-11-15T11:00:00Z"
    }))
  };
  const manifestBytes=Buffer.from(JSON.stringify(manifest),"utf8");
  const signatureBytes=sign(null,manifestBytes,privateKey);
  const args={indexText,manifestBytes,signatureBytes,reviewerPublicKeyPem,trustedSpkiSha256};
  return {args,privateKey,manifest};
}
test("valid signed, exact 4647 ID review reports counts, no publication",()=>{
  const {args}=fixture();
  const result=verifyAttestation(args);
  assert.equal(result.validated_metadata_rows,4647);
  assert.deepEqual(result.decision_counts,{APPROVED_NONEXPLICIT:1,HOLD:4645,REJECT:1});
  assert.equal(result.signature_valid,true);
  assert.equal(result.media_inspected_by_this_script,false);
  assert.equal(result.approved_to_auto_publish,0);
});
test("signed manifest with modified byte fails signature check",()=>{
  const {args}=fixture();
  const altered=Buffer.from(args.manifestBytes);
  altered[30]^=1;
  assert.throws(()=>verifyAttestation({...args,manifestBytes:altered}),/invalid detached reviewer signature/);
});
test("wrong reviewer public key fingerprint fails closed",()=>{
  const {args}=fixture();
  assert.throws(()=>verifyAttestation({...args,trustedSpkiSha256:"0".repeat(64)}),/fingerprint/);
});
test("incomplete signed reviewer decision list fails closed",()=>{
  const {args,manifest,privateKey}=fixture();
  manifest.items.pop();
  const manifestBytes=Buffer.from(JSON.stringify(manifest));
  assert.throws(()=>verifyAttestation({
    ...args,manifestBytes,signatureBytes:sign(null,manifestBytes,privateKey)
  }),/metadata or index binding invalid/);
});
test("index manipulation fails SHA-256 binding or count check",()=>{
  const {args}=fixture();
  const changed=args.indexText.replace("ORIGINAL_EXISTING_COVER","NEEDS_INDIVIDUAL_COVER");
  assert.throws(()=>verifyAttestation({...args,indexText:changed}),/totals no longer reconcile/);
});
