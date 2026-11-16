/**
 * Phase 327 — verify a qualified independent adult reviewer's ID-only,
 * cryptographically signed clearance results.
 *
 * SECURITY: Metadata-only. Does NOT access media, approve uploads,
 * generate images, change any website/database setting, or publish content.
 *
 * The signer's SHA-256 SPKI fingerprint MUST have been independently obtained
 * and authenticated via a trusted channel. Never accept a key/fingerprint
 * shipped alongside a manifest as proof of the reviewer's identity.
 */
import {
  createHash, createPublicKey, timingSafeEqual, verify,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HEADER =
  "media_id,cover_inventory,qualified_content_review,approved_for_new_publication";
const REQUIRED_COUNT=4647;
const ALLOWED_COVERS=new Set([
  "ORIGINAL_EXISTING_COVER",
  "RECENTLY_PUBLISHED_COVER",
  "NEEDS_INDIVIDUAL_COVER",
]);
const DECISIONS=new Set(["APPROVED_NONEXPLICIT","HOLD","REJECT"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256=value=>createHash("sha256").update(value).digest("hex");
function error(reason){throw new Error("Independent clearance verification failed: "+reason);}
function trustedHex(h){
  if(typeof h!=="string"||!/^[0-9a-f]{64}$/i.test(h))error("missing trusted reviewer key fingerprint");
  return Buffer.from(h.toLowerCase(),"hex");
}
function parseIndex(csv, expectedCount){
  const lines=csv.trimEnd().split(/\r?\n/);
  if(lines[0]!==HEADER || lines.length!==expectedCount+1)
    error("original Phase 326 index has wrong format or row count");
  const ids=new Set();
  const cover={ORIGINAL_EXISTING_COVER:0,RECENTLY_PUBLISHED_COVER:0,NEEDS_INDIVIDUAL_COVER:0};
  for(const line of lines.slice(1)){
    const parts=line.split(",");
    const [id,kind,status,approval]=parts;
    if(parts.length!==4||!UUID.test(id)||id!==id.toLowerCase()||
      !ALLOWED_COVERS.has(kind)||status!=="REVIEW_REQUIRED"||
      approval!=="false"||ids.has(id))error("invalid or duplicate index entry");
    ids.add(id);cover[kind]++;
  }
  if(expectedCount===REQUIRED_COUNT &&
    (cover.ORIGINAL_EXISTING_COVER!==1001 ||
     cover.RECENTLY_PUBLISHED_COVER!==29 ||
     cover.NEEDS_INDIVIDUAL_COVER!==3617))
    error("Phase 326 totals no longer reconcile");
  return ids;
}
function preciseKeys(obj,keys){
  return obj && typeof obj==="object"&&!Array.isArray(obj) &&
    Object.keys(obj).sort().join("|")===keys.slice().sort().join("|");
}

/**
 * Verifies cryptographic provenance and structural completeness, not
 * whether the reviewer actually inspected each video. Never treat this
 * report alone as an authorization to publish unverified content.
 */
export function verifyAttestation({
  indexText, manifestBytes, signatureBytes, reviewerPublicKeyPem,
  trustedSpkiSha256, expectedCount=REQUIRED_COUNT,
}){
  if(!Number.isInteger(expectedCount)||expectedCount<1) error("invalid expected count");
  const ids=parseIndex(indexText,expectedCount);
  let key;
  try{key=createPublicKey(reviewerPublicKeyPem);}
  catch{error("invalid independent reviewer public key");}
  if(key.asymmetricKeyType!=="ed25519")error("reviewer key must be Ed25519");
  const observed=Buffer.from(sha256(key.export({type:"spki",format:"der"})),"hex");
  if(!timingSafeEqual(observed,trustedHex(trustedSpkiSha256)))
    error("reviewer fingerprint does not match the trusted record");
  if(!Buffer.isBuffer(manifestBytes) || !Buffer.isBuffer(signatureBytes) ||
    signatureBytes.length!==64 ||
    !verify(null,manifestBytes,key,signatureBytes))
    error("invalid detached reviewer signature");
  let manifest;
  try{manifest=JSON.parse(manifestBytes.toString("utf8"));}
  catch{error("signed manifest is not valid JSON");}
  if(!preciseKeys(manifest,[
    "schema","reviewer_org","reviewer_id","completed_at",
    "source_index_sha256","items"
  ])||manifest.schema!=="jb-independent-clearance-v1"||
    typeof manifest.reviewer_org!=="string"||manifest.reviewer_org.trim().length<3||
    typeof manifest.reviewer_id!=="string"||manifest.reviewer_id.trim().length<3||
    typeof manifest.completed_at!=="string"||
    !/^\d{4}-\d{2}-\d{2}T/.test(manifest.completed_at)||
    !Number.isFinite(Date.parse(manifest.completed_at))||
    Date.parse(manifest.completed_at)>Date.now()||
    manifest.source_index_sha256!==sha256(indexText)||
    !Array.isArray(manifest.items)||
    manifest.items.length!==expectedCount)
    error("manifest metadata or index binding invalid");
  const decisions={APPROVED_NONEXPLICIT:0,HOLD:0,REJECT:0};
  const seen=new Set();
  for(const row of manifest.items){
    if(!preciseKeys(row,["media_id","decision","reviewed_at"]) ||
      typeof row.media_id!=="string"||!ids.has(row.media_id)||
      seen.has(row.media_id)||!DECISIONS.has(row.decision)||
      typeof row.reviewed_at!=="string"||
      !/^\d{4}-\d{2}-\d{2}T/.test(row.reviewed_at)||
      !Number.isFinite(Date.parse(row.reviewed_at))||
      Date.parse(row.reviewed_at)>Date.parse(manifest.completed_at)){
      error("unreviewed, incomplete, duplicate or unsupported ID/decision");
    }
    seen.add(row.media_id);
    decisions[row.decision]++;
  }
  if(seen.size!==expectedCount)error("review does not cover full index");
  return Object.freeze({
    validated_metadata_rows:seen.size,
    signed_by_fingerprint:observed.toString("hex"),
    reviewer_org:manifest.reviewer_org,
    completed_at:manifest.completed_at,
    decision_counts:Object.freeze(decisions),
    signature_valid:true,
    media_inspected_by_this_script:false,
    approved_to_auto_publish:0,
  });
}

async function main(){
  const args=new Map(process.argv.slice(2).map(part=>{
    const pos=part.indexOf("=");
    return pos>2&&part.startsWith("--")?
      [part.slice(2,pos),part.slice(pos+1)]:[part,""];
  }));
  if(!args.has("--verify"))error("supply --verify and all required file paths");
  const root=path.resolve(process.env.JB_THUMBNAIL_OUTPUT_DIR||
    path.join(".local","thumbnail-batch-317d"));
  const manifest=args.get("--manifest");
  const signature=args.get("--signature");
  const keyFile=args.get("--reviewer-public-key");
  const fingerprint=process.env.JB_TRUSTED_REVIEWER_SPKI_SHA256;
  if(!manifest||!signature||!keyFile||!fingerprint)
    error("missing external review manifest, signature, reviewer key or trusted pinned fingerprint");
  const [indexText,manifestBytes,signatureBytes,reviewerPublicKeyPem]=await Promise.all([
    readFile(path.join(root,"phase326-full-catalog-adult-review-index.csv"),"utf8"),
    readFile(manifest),readFile(signature),readFile(keyFile,"utf8"),
  ]);
  const report=verifyAttestation({
    indexText,manifestBytes,signatureBytes,reviewerPublicKeyPem,
    trustedSpkiSha256:fingerprint
  });
  console.log("PHASE 327 — SIGNED METADATA VERIFICATION ONLY");
  console.log(JSON.stringify(report,null,2));
  console.log("No source video opened and no thumbnail generated or published.");
}
if(process.argv[1] &&
  import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(e=>{
    console.error(e.message);
    process.exitCode=1;
  });
}
