import React, { useState } from 'react';
import { Mail, Copy, Check, ExternalLink, X, Send, CheckCircle2, Globe } from 'lucide-react';
import { emailService } from '../services/emailService';

interface EmailReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  defaultRecipient?: string;
  initialSubject: string;
  initialBody: string;
  onSaveRecipient?: (email: string) => void;
}

export const EmailReportModal: React.FC<EmailReportModalProps> = ({
  isOpen,
  onClose,
  title,
  defaultRecipient = 'superservpos@gmail.com',
  initialSubject,
  initialBody,
  onSaveRecipient
}) => {
  const [recipient, setRecipient] = useState(defaultRecipient || 'superservpos@gmail.com');
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  React.useEffect(() => {
    setRecipient(defaultRecipient || 'superservpos@gmail.com');
    setSubject(initialSubject);
    setBody(initialBody);
  }, [defaultRecipient, initialSubject, initialBody, isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setStatusMsg({ type: 'success', text: 'Report text copied to clipboard!' });
    setTimeout(() => {
      setCopied(false);
      setStatusMsg(null);
    }, 3000);
  };

  const handleLaunch = (type: 'gmail' | 'outlook' | 'yahoo' | 'mailto') => {
    if (!recipient.trim()) {
      setStatusMsg({ type: 'info', text: 'Please enter a recipient email address.' });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    if (onSaveRecipient) {
      onSaveRecipient(recipient.trim());
    }

    emailService.openEmailClient(type, recipient, subject, body);

    const labels: Record<string, string> = {
      gmail: 'Google Gmail compose tab',
      outlook: 'Outlook webmail',
      yahoo: 'Yahoo mail compose',
      mailto: 'system email client'
    };

    setStatusMsg({
      type: 'success',
      text: `Opened in ${labels[type]} for ${recipient.trim()}!`
    });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto text-black">
        {/* Header */}
        <div className="bg-white text-black border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-500 text-amber-600 flex items-center justify-center font-bold shadow-2xs">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-black">{title}</div>
              <div className="text-xs text-slate-500">
                Send report directly via Webmail (Gmail/Outlook) or default Mail App
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-black transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {statusMsg && (
          <div
            className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                : 'bg-amber-50 text-amber-950 border-amber-300'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Recipient Input */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
              Recipient Email Address
            </label>
            <input
              type="email"
              placeholder="e.g. superservpos@gmail.com / manager@company.com"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500 shadow-2xs"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Email Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
            />
          </div>

          {/* Body Preview */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Report Content Preview</label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-[11px] font-mono text-black focus:outline-amber-500 shadow-2xs"
            />
          </div>

          {/* Quick Dispatch Channels */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-2">
              Select Dispatch Method (Send instantly via):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Gmail Direct */}
              <button
                type="button"
                onClick={() => handleLaunch('gmail')}
                className="p-3 rounded-2xl bg-white hover:bg-rose-50 border-2 border-rose-400 text-rose-950 font-bold text-xs flex flex-col items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition-all"
              >
                <div className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center font-black text-xs">
                  M
                </div>
                <span>Gmail (Web)</span>
              </button>

              {/* Outlook Direct */}
              <button
                type="button"
                onClick={() => handleLaunch('outlook')}
                className="p-3 rounded-2xl bg-white hover:bg-blue-50 border-2 border-blue-400 text-blue-950 font-bold text-xs flex flex-col items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition-all"
              >
                <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs">
                  O
                </div>
                <span>Outlook (Web)</span>
              </button>

              {/* Default Mail App (mailto) */}
              <button
                type="button"
                onClick={() => handleLaunch('mailto')}
                className="p-3 rounded-2xl bg-white hover:bg-amber-50 border-2 border-amber-500 text-amber-950 font-bold text-xs flex flex-col items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition-all"
              >
                <div className="w-6 h-6 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-xs">
                  <Mail className="w-3.5 h-3.5 text-white" />
                </div>
                <span>Mail App</span>
              </button>

              {/* Copy Full Report */}
              <button
                type="button"
                onClick={handleCopy}
                className="p-3 rounded-2xl bg-white hover:bg-slate-50 border-2 border-slate-300 text-slate-800 font-bold text-xs flex flex-col items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition-all"
              >
                <div className="w-6 h-6 rounded-lg bg-slate-700 text-white flex items-center justify-center font-bold text-xs">
                  <Copy className="w-3.5 h-3.5 text-white" />
                </div>
                <span>{copied ? 'Copied!' : 'Copy Report'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">Recipient default: {recipient}</div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-black border border-slate-300 text-xs font-bold cursor-pointer shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
