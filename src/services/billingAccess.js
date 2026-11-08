import { supabase } from "./supabaseClient";

export const FREE_ACCESS = Object.freeze({tier:"free",can_view_albums:false,can_download:false,show_ads:false,access_expires_at:null});

export async function getBillingAccess() {
  const {data:{user},error:authError} = await supabase.auth.getUser();
  if (authError || !user || user.is_anonymous) return {...FREE_ACCESS};
  const {data,error} = await supabase.rpc("jb_billing_my_access");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !["free","standard","vip"].includes(row.tier)) throw new Error("Invalid membership response");
  const valid = row.tier !== "free" && row.can_view_albums === true &&
    typeof row.access_expires_at === "string" && new Date(row.access_expires_at).getTime() > Date.now();
  return {
    tier: valid ? row.tier : "free",
    can_view_albums: valid,
    can_download: valid && row.tier === "vip" && row.can_download === true,
    show_ads: valid ? row.show_ads === true : false,
    access_expires_at: valid ? row.access_expires_at : null,
  };
}
