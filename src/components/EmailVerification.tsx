import { useEffect, useState } from 'react';
import { CheckCircle, Mail, ArrowRight, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function EmailVerification() {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Get the hash from URL (Supabase sends the token in the hash)
        const hash = window.location.hash;

        // Get query parameters (Supabase also sends verification code as query param)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if ((hash && hash.includes('access_token')) || code) {
          // Email verification doesn't auto-sign users in
          // Just show success message and redirect to login
          setStatus('success');
        } else {
          setStatus('error');
        }
      } catch (error) {
        setStatus('error');
      }
    };

    verifyEmail();
  }, []);

  useEffect(() => {
    if (status === 'success' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (status === 'success' && countdown === 0) {
      // Clear only view-related storage to prevent conflicts
      // Don't clear everything as it might remove auth session
      sessionStorage.removeItem('currentView');
      sessionStorage.removeItem('selectedPaperId');
      sessionStorage.removeItem('selectedConversationId');
      // Force redirect to login page (replace removes current page from history)
      window.location.replace('/login');
    }
  }, [status, countdown]);

  const handleGoToLogin = () => {
    // Clear only view-related storage to prevent conflicts
    // Don't clear everything as it might remove auth session
    sessionStorage.removeItem('currentView');
    sessionStorage.removeItem('selectedPaperId');
    sessionStorage.removeItem('selectedConversationId');
    // Force redirect to login page (replace removes current page from history)
    window.location.replace('/login');
  };

  if (status === 'verifying') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-6">
            <Loader className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Verifying your email...</h1>
          <p className="text-gray-600">
            Please wait while we verify your email address.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6">
            <Mail className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Verification Failed</h1>
          <p className="text-gray-600 mb-6">
            We couldn't verify your email. The link may have expired or is invalid.
          </p>
          <button
            onClick={handleGoToLogin}
            className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
          >
            <span>Go to Login</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-3">Email Verified!</h1>

        <p className="text-gray-600 mb-6">
          Your email has been successfully verified. You can now log in to your account and start using the platform.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900">
            Redirecting you to the login page in <strong>{countdown}</strong> seconds...
          </p>
        </div>

        <button
          onClick={handleGoToLogin}
          className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
        >
          <span>Go to Login Now</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-xs text-gray-500 mt-4">
          Welcome to AI Exam Papers! 🎉
        </p>
      </div>
    </div>
  );
}
