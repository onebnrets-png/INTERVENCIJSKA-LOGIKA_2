import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';

export function VerifyMFA({ onVerified, language }) {
    const [verifyCode, setVerifyCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const onSubmit = async () => {
        setError('');
        setLoading(true);
        try {
            const factors = await supabase.auth.mfa.listFactors();
            if (factors.error) throw factors.error;

            const totpFactor = factors.data.totp[0];
            if (!totpFactor) {
                setError('No TOTP factor found.');
                return;
            }

            const challenge = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
            if (challenge.error) {
                setError(challenge.error.message);
                return;
            }

            const verify = await supabase.auth.mfa.verify({
                factorId: totpFactor.id,
                challengeId: challenge.data.id,
                code: verifyCode,
            });
            if (verify.error) {
                setError(verify.error.message);
                return;
            }

            onVerified();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-sky-50">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">
                        {language === 'si' ? 'Dvostopenjsko preverjanje' : 'Two-Factor Authentication'}
                    </h2>
                    <p className="text-sm text-slate-500 mt-2">
                        {language === 'si'
                            ? 'Vnesi 6-mestno kodo iz svoje authenticator aplikacije.'
                            : 'Enter the 6-digit code from your authenticator app.'}
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm text-center">
                        {error}
                    </div>
                )}

                <input
                    type="text"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.trim())}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full p-3 border border-slate-300 rounded-lg text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-sky-500 focus:border-sky-500 mb-4"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && verifyCode.length === 6 && onSubmit()}
                />

                <button
                    onClick={onSubmit}
                    disabled={verifyCode.length !== 6 || loading}
                    className="w-full px-4 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {loading 
                        ? (language === 'si' ? 'Preverjanje...' : 'Verifying...') 
                        : (language === 'si' ? 'Potrdi' : 'Verify')}
                </button>
            </div>
        </div>
    );
}
