import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  CreditCard, 
  Upload, 
  Check, 
  Copy, 
  FileText, 
  AlertCircle,
  X,
  Image as ImageIcon,
  Lock,
  LogIn
} from "lucide-react";

export default function BuyVip() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [refNumber, setRefNumber] = useState("");
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: "", text: "" });
  const [copied, setCopied] = useState(false);

  const navigate = useNavigate();

  // Bank & E-Wallet Account Details
  const bankDetails = {
    accountName: "JB Collections",
    accountNumber: "09685289257",
    bankName: "OwnBank (via InstaPay / GCash / Maya / QR Ph)",
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      setAuthLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user && !user.is_anonymous) {
        setUser(user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Auth check error:", err);
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCopyAccount = () => {
    navigator.clipboard.writeText(bankDetails.accountNumber.replace(/\s+/g, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle local image file selection & instant preview
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatusMsg({ type: "error", text: "Please upload a valid image file (PNG, JPG, JPEG, WEBP)." });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      setStatusMsg({ type: "error", text: "File size exceeds 5MB. Please choose a smaller image." });
      return;
    }

    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
    setStatusMsg({ type: "", text: "" });
  };

  const handleRemoveReceipt = () => {
    setReceiptFile(null);
    if (receiptPreview) {
      URL.revokeObjectURL(receiptPreview);
      setReceiptPreview(null);
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();

    // 1. STRICT VALIDATION: Dapat parehong may laman
    if (!refNumber.trim() && !receiptFile) {
      setStatusMsg({ type: "error", text: "⚠️ Both Reference Number AND Payment Receipt Image are required!" });
      return;
    }

    if (!refNumber.trim()) {
      setStatusMsg({ type: "error", text: "⚠️ Please input the Reference / Transaction Number." });
      return;
    }

    if (!receiptFile) {
      setStatusMsg({ type: "error", text: "⚠️ Please attach your payment receipt image." });
      return;
    }

    if (!user) {
      setStatusMsg({ type: "error", text: "You must be logged in to submit a payment verification ticket." });
      return;
    }

    setLoading(true);
    setStatusMsg({ type: "", text: "" });

    try {
      // Upload Receipt Image to Supabase Storage
      const rawExt = receiptFile.name.split(".").pop();
      const fileExt = rawExt ? rawExt.toLowerCase() : "jpg";
      const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      const filePath = `payment_proofs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, receiptFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get Public URL
      const { data: urlData } = supabase.storage
        .from("receipts")
        .getPublicUrl(filePath);

      const receiptUrl = urlData?.publicUrl;

      // Extract metadata
      const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.username || user.email?.split("@")[0] || "VIP Member";
      const userEmail = user.email || "";

      // Save ticket to Database
      const { error: dbError } = await supabase.from("support_tickets").insert([
        {
          user_id: user.id,
          user_email: userEmail,
          email: userEmail,
          user_name: userName,
          name: userName,
          subject: "💳 VIP Payment Proof Verification",
          reference_number: refNumber.trim(),
          receipt_url: receiptUrl,
          attachment_url: receiptUrl,
          proof_url: receiptUrl,
          message: `VIP Access Purchase Proof:\n\n• Reference No: ${refNumber.trim()}\n• Receipt URL: ${receiptUrl}`,
          status: "open",
        },
      ]);

      if (dbError) throw dbError;

      setStatusMsg({
        type: "success",
        text: "🎉 Payment proof submitted! A support ticket has been opened for admin verification.",
      });

      // Reset Form State
      setRefNumber("");
      handleRemoveReceipt();
    } catch (err) {
      console.error("Payment Submission Error:", err);
      setStatusMsg({ type: "error", text: "Submission failed: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  // Condition to check if form is complete
  const isFormComplete = refNumber.trim() !== "" && receiptFile !== null;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-10 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Navigation Back Button */}
        <button
          onClick={() => navigate("/profile")}
          className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Profile
        </button>

        {/* Page Title */}
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Avail 30-Day VIP Access</h1>
          <p className="text-slate-400 text-xs mt-1">
            Follow the instructions below to submit your payment verification ticket.
          </p>
        </div>

        {/* Instructions Steps Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            📌 How to Get Your VIP Access Code
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
              <span className="text-amber-400 font-extrabold text-sm block mb-1">Step 1</span>
              <p className="text-slate-300 font-semibold mb-1">Check Amount</p>
              <p className="text-slate-400 text-[11px]">Transfer ₱150 for 30 Days of VIP Access.</p>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
              <span className="text-amber-400 font-extrabold text-sm block mb-1">Step 2</span>
              <p className="text-slate-300 font-semibold mb-1">Send Payment</p>
              <p className="text-slate-400 text-[11px]">Pay via GCash, Maya, or QR Ph using the details below.</p>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
              <span className="text-amber-400 font-extrabold text-sm block mb-1">Step 3</span>
              <p className="text-slate-300 font-semibold mb-1">Attach Receipt</p>
              <p className="text-slate-400 text-[11px]">Upload receipt screenshot and enter Reference No.</p>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
              <span className="text-amber-400 font-extrabold text-sm block mb-1">Step 4</span>
              <p className="text-slate-300 font-semibold mb-1">Ticket Review</p>
              <p className="text-slate-400 text-[11px]">Once verified by Admin, your VIP Code will be issued.</p>
            </div>
          </div>
        </div>

        {/* Grid: Payment Details & Submission Form */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          
          {/* Payment Info Card with QR Code */}
          <div className="md:col-span-2 bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-400" /> Payment Details
            </h3>

            {/* QR Code Display */}
            <div className="bg-white p-3 rounded-xl flex justify-center items-center shadow-md">
              <img
                src="/Ownbank_QR.jpg"
                alt="Payment QR Code"
                className="w-48 h-48 object-contain rounded-lg"
              />
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Bank Provider</span>
                <span className="text-xs font-bold text-white">{bankDetails.bankName}</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Account Name</span>
                <span className="text-xs font-bold text-slate-200">{bankDetails.accountName}</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Account / Mobile Number</span>
                <div className="flex justify-between items-center mt-1 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-sm font-mono font-bold text-amber-400 tracking-wider">
                    {bankDetails.accountNumber}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAccount}
                    className="text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1"
                  >
                    {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl leading-relaxed flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>Verify your Reference Number carefully before submitting to avoid delay in ticket processing.</span>
            </div>
          </div>

          {/* Submission Form Card */}
          <div className="md:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-400" /> Submit Payment Ticket
              </h3>

              {statusMsg.text && (
                <div className={`p-4 rounded-xl mb-4 text-xs font-bold border flex items-center justify-between ${
                  statusMsg.type === "success" 
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                    : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                }`}>
                  <span>{statusMsg.text}</span>
                  <button 
                    onClick={() => setStatusMsg({ type: "", text: "" })}
                    className="font-bold opacity-70 hover:opacity-100 cursor-pointer ml-2"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* AUTH CHECK RENDERING */}
              {authLoading ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  Checking account status...
                </div>
              ) : !user ? (
                /* LOCKED CARD FOR UNREGISTERED / GUEST USERS */
                <div className="bg-slate-950 border border-amber-500/30 rounded-2xl p-6 text-center space-y-4 my-auto">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Registration Required</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      You must be logged in with a registered account to submit a payment proof and activate VIP access.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      onClick={() => navigate("/login")}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-500/10"
                    >
                      <LogIn className="w-4 h-4" /> Log In / Register Account
                    </button>
                  </div>
                </div>
              ) : (
                /* FORM FOR REGISTERED USERS ONLY */
                <form onSubmit={handleSubmitPayment} className="space-y-4">
                  
                  {/* Logged in email badge */}
                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2.5 text-xs text-indigo-300 flex items-center justify-between">
                    <span>Submitting ticket as:</span>
                    <span className="font-bold text-white">{user.email}</span>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1.5 block flex justify-between">
                      <span>Reference / Transaction Number</span>
                      <span className="text-amber-400 font-bold">*Required</span>
                    </label>
                    <input
                      type="text"
                      value={refNumber}
                      onChange={(e) => setRefNumber(e.target.value)}
                      placeholder="e.g. 100293848201"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 font-mono transition-colors"
                      required
                    />
                  </div>

                  {/* Receipt File Upload Field */}
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1.5 block flex justify-between">
                      <span>Attach Payment Receipt Image</span>
                      <span className="text-amber-400 font-bold">*Required</span>
                    </label>
                    
                    {!receiptPreview ? (
                      <label className="border-2 border-dashed border-slate-800 hover:border-amber-500/50 bg-slate-950/60 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors group">
                        <ImageIcon className="w-8 h-8 text-slate-600 group-hover:text-amber-400 mb-2 transition-colors" />
                        <span className="text-xs font-bold text-slate-300">Click to upload payment receipt</span>
                        <span className="text-[10px] text-slate-500 mt-1">Supports PNG, JPG, JPEG, WEBP (Max 5MB)</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                          required
                        />
                      </label>
                    ) : (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 relative">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 truncate max-w-[200px]">
                            <FileText className="w-3.5 h-3.5 text-amber-400" /> {receiptFile?.name}
                          </span>
                          <button
                            type="button"
                            onClick={handleRemoveReceipt}
                            className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" /> Remove
                          </button>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-2 border border-slate-800/80 flex justify-center">
                          <img
                            src={receiptPreview}
                            alt="Receipt preview"
                            className="max-h-48 object-contain rounded-md"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SUBMIT BUTTON WITH DISABLED STATE IF INCOMPLETE */}
                  <button
                    type="submit"
                    disabled={loading || !isFormComplete}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-950 font-black py-3 text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-amber-950/30 mt-2 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading 
                      ? "Submitting Ticket..." 
                      : !isFormComplete 
                        ? "Please fill reference & upload receipt" 
                        : "Submit Proof for Verification"}
                  </button>
                </form>
              )}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}