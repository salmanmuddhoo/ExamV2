import { BookOpen, Brain, Lock, Zap, CheckCircle, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Props {
  onGetStarted: () => void;
}

export function Homepage({ onGetStarted }: Props) {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-20 sm:py-28">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              Master Your Exams with AI-Powered Study Assistant
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed">
              Access past exam papers with an intelligent AI tutor that guides you through
              every question, providing detailed explanations and personalized learning support.
            </p>
            <button
              onClick={onGetStarted}
              className="inline-flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-lg font-medium"
            >
              <span>Get Started</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Everything You Need to Succeed
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<BookOpen className="w-8 h-8" />}
              title="Comprehensive Exam Library"
              description="Access a growing collection of past exam papers organized by grade level and subject, all in one place."
            />
            <FeatureCard
              icon={<Brain className="w-8 h-8" />}
              title="AI-Powered Learning"
              description="Get instant, intelligent responses to your questions. Our AI tutor provides step-by-step explanations and practical examples."
            />
            <FeatureCard
              icon={<Zap className="w-8 h-8" />}
              title="Interactive Study Experience"
              description="View exam papers alongside AI chat. Ask questions, request clarifications, and learn at your own pace."
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Step
              number="1"
              title="Browse Exam Papers"
              description="Navigate through organized exam papers by grade level and subject using our intuitive menu."
            />
            <Step
              number="2"
              title="View & Study"
              description="Open any exam paper to view it directly in your browser. No downloads needed."
            />
            <Step
              number="3"
              title="Ask the AI Tutor"
              description="Get help on any question. Our AI provides detailed explanations, examples, and tips to help you understand every concept."
            />
          </div>
        </div>
      </section>

      {/* Benefits Section with iPhone Demo */}
      <section className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Why Students Love Our Platform
              </h2>
              <div className="space-y-4">
                <Benefit text="Learn at your own pace with 24/7 AI assistance" />
                <Benefit text="Get detailed explanations for every exam question" />
                <Benefit text="Access marking schemes for better understanding" />
                <Benefit text="Practice with real past exam papers" />
                <Benefit text="No downloads required - everything works in your browser" />
                <Benefit text="Free access to all exam papers and AI assistance" />
              </div>
            </div>
            <div className="flex justify-center">
              <IPhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-16 sm:py-20 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to Start Learning?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Sign up now to unlock the full potential of AI-powered exam preparation.
          </p>
          <button
            onClick={onGetStarted}
            className="inline-flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-lg font-medium"
          >
            <span>Sign Up Free</span>
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-sm text-gray-500 mt-4">
            No credit card required. Start learning in seconds.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center text-gray-600 text-sm">
            <p>&copy; {new Date().getFullYear()} Exam Study Assistant. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-lg mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 bg-black text-white rounded-full mb-4 text-xl font-bold">
        {number}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <div className="flex items-start space-x-3">
      <CheckCircle className="w-6 h-6 text-black flex-shrink-0 mt-0.5" />
      <span className="text-gray-700">{text}</span>
    </div>
  );
}

function IPhoneMockup() {
  const [activeView, setActiveView] = useState<'pdf' | 'chat'>('pdf');

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveView(prev => prev === 'pdf' ? 'chat' : 'pdf');
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      {/* iPhone Frame */}
      <div className="relative w-[280px] h-[570px] bg-black rounded-[50px] p-3 shadow-2xl">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[25px] bg-black rounded-b-3xl z-20"></div>
        
        {/* Screen */}
        <div className="relative w-full h-full bg-white rounded-[40px] overflow-hidden">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 bg-white border-b border-gray-200 px-3 py-2 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-gray-200 rounded"></div>
                <div>
                  <div className="w-24 h-2.5 bg-gray-900 rounded mb-1"></div>
                  <div className="w-16 h-1.5 bg-gray-400 rounded"></div>
                </div>
              </div>
              
              {/* Toggle */}
              <div className="relative bg-gray-200 rounded-full p-0.5 flex items-center">
                <div
                  className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-black rounded-full transition-transform duration-300 ease-in-out ${
                    activeView === 'chat' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'
                  }`}
                />
                <button
                  onClick={() => setActiveView('pdf')}
                  className="relative z-10 px-2 py-1"
                >
                  <div className={`w-3 h-3 ${activeView === 'pdf' ? 'bg-white' : 'bg-gray-600'} rounded transition-colors`}></div>
                </button>
                <button
                  onClick={() => setActiveView('chat')}
                  className="relative z-10 px-2 py-1"
                >
                  <div className={`w-3 h-3 ${activeView === 'chat' ? 'bg-white' : 'bg-gray-600'} rounded transition-colors`}></div>
                </button>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="absolute top-[52px] left-0 right-0 bottom-0 overflow-hidden">
            {/* PDF View */}
            <div
              className={`absolute inset-0 bg-gray-100 transition-transform duration-500 ease-in-out ${
                activeView === 'pdf' ? 'translate-x-0' : '-translate-x-full'
              }`}
            >
              <div className="p-4 space-y-3">
                {/* Simulated PDF content */}
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="w-20 h-2 bg-gray-900 rounded mb-2"></div>
                  <div className="space-y-1.5">
                    <div className="w-full h-1.5 bg-gray-300 rounded"></div>
                    <div className="w-full h-1.5 bg-gray-300 rounded"></div>
                    <div className="w-3/4 h-1.5 bg-gray-300 rounded"></div>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="w-24 h-2 bg-gray-900 rounded mb-2"></div>
                  <div className="space-y-1.5">
                    <div className="w-full h-1.5 bg-gray-300 rounded"></div>
                    <div className="w-full h-1.5 bg-gray-300 rounded"></div>
                    <div className="w-5/6 h-1.5 bg-gray-300 rounded"></div>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="w-16 h-2 bg-gray-900 rounded mb-2"></div>
                  <div className="space-y-1.5">
                    <div className="w-full h-1.5 bg-gray-300 rounded"></div>
                    <div className="w-full h-1.5 bg-gray-300 rounded"></div>
                    <div className="w-2/3 h-1.5 bg-gray-300 rounded"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Chat View */}
            <div
              className={`absolute inset-0 bg-white transition-transform duration-500 ease-in-out ${
                activeView === 'chat' ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <div className="h-full flex flex-col">
                {/* Chat messages */}
                <div className="flex-1 p-3 space-y-3 overflow-hidden">
                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="bg-black text-white rounded-2xl rounded-tr-sm px-3 py-2 max-w-[80%]">
                      <div className="w-32 h-1.5 bg-white bg-opacity-90 rounded mb-1"></div>
                      <div className="w-24 h-1.5 bg-white bg-opacity-90 rounded"></div>
                    </div>
                  </div>

                  {/* AI message */}
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                      <div className="w-36 h-1.5 bg-gray-600 rounded mb-1"></div>
                      <div className="w-32 h-1.5 bg-gray-600 rounded mb-1"></div>
                      <div className="w-28 h-1.5 bg-gray-600 rounded mb-1"></div>
                      <div className="w-24 h-1.5 bg-gray-600 rounded"></div>
                    </div>
                  </div>

                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="bg-black text-white rounded-2xl rounded-tr-sm px-3 py-2 max-w-[80%]">
                      <div className="w-28 h-1.5 bg-white bg-opacity-90 rounded"></div>
                    </div>
                  </div>

                  {/* AI message */}
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                      <div className="w-32 h-1.5 bg-gray-600 rounded mb-1"></div>
                      <div className="w-36 h-1.5 bg-gray-600 rounded mb-1"></div>
                      <div className="w-28 h-1.5 bg-gray-600 rounded"></div>
                    </div>
                  </div>
                </div>

                {/* Input area */}
                <div className="p-3 border-t border-gray-200">
                  <div className="flex space-x-2">
                    <div className="flex-1 px-2.5 py-2 border border-gray-300 rounded bg-white">
                      <div className="w-24 h-1.5 bg-gray-400 rounded"></div>
                    </div>
                    <div className="w-9 h-9 bg-black rounded flex items-center justify-center">
                      <div className="w-3 h-3 border-2 border-white border-l-0 border-b-0 transform rotate-45 -translate-x-0.5"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating indicator */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap shadow-lg">
        {activeView === 'pdf' ? '📄 Viewing Exam Paper' : '💬 AI Chat Assistant'}
      </div>
    </div>
  );
}