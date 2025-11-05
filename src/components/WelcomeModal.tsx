import { Sparkles, MessageSquare, FileText, ArrowRight, X, Menu, Calendar, User, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { formatTokenCount } from '../lib/formatUtils';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokensRemaining: number;
  papersRemaining: number;
  onUpgrade?: () => void;
}

export function WelcomeModal({ isOpen, onClose, tokensRemaining, papersRemaining, onUpgrade }: WelcomeModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      title: 'Welcome to Your AI Study Assistant!',
      subtitle: 'You\'re all set to start studying smarter',
      content: (
        <>
          {/* Free Tier Info */}
          <div className="bg-gray-50 rounded-xl p-3 mb-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs font-semibold">
                FREE TIER
              </div>
            </div>
            <p className="text-xs text-gray-700 mb-3">
              You're currently on our <strong>Free Plan</strong>. Here's what you get:
            </p>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-white rounded-lg p-2 border border-gray-200">
                <div className="flex items-center space-x-1 mb-1">
                  <MessageSquare className="w-3 h-3 text-gray-900" />
                  <span className="text-xs font-medium text-gray-600">FREE AI Tokens</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatTokenCount(Math.max(0, tokensRemaining))}</p>
                <p className="text-xs text-gray-500">per month</p>
              </div>

              <div className="bg-white rounded-lg p-2 border border-gray-200">
                <div className="flex items-center space-x-1 mb-1">
                  <FileText className="w-3 h-3 text-gray-900" />
                  <span className="text-xs font-medium text-gray-600">Exam Papers</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{papersRemaining}</p>
                <p className="text-xs text-gray-500">with AI chat</p>
              </div>
            </div>

            <div className="bg-gray-100 border border-gray-200 rounded-lg p-2">
              <p className="text-xs text-gray-800">
                <strong>💡 Pro Tip:</strong> Use your tokens wisely! Each question uses tokens.
              </p>
            </div>
          </div>

          {/* Upgrade CTA */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 mb-3 border border-gray-200">
            <p className="text-xs font-semibold text-gray-900 mb-1">
              Want unlimited access?
            </p>
            <p className="text-xs text-gray-600 mb-2">
              Upgrade to <strong>Student Package</strong> or <strong>Premium</strong> for unlimited exam papers, more AI tokens, and advanced features!
            </p>
            <button
              onClick={() => {
                if (onUpgrade) {
                  onUpgrade();
                }
                onClose();
              }}
              className="w-full bg-gradient-to-r from-gray-900 to-gray-700 text-white py-2 px-3 rounded-lg text-xs font-medium hover:from-gray-800 hover:to-gray-600 transition-all flex items-center justify-center space-x-2"
            >
              <span>Explore Plans</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </>
      )
    },
    {
      title: 'Navigation Made Easy',
      subtitle: 'Find everything you need in one place',
      content: (
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-start space-x-3">
              <div className="bg-gray-900 p-2 rounded-lg flex-shrink-0">
                <Menu className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">Hamburger Menu</h3>
                <p className="text-xs text-gray-600 mb-2">
                  Click the menu icon in the top-right corner to access:
                </p>
                <ul className="space-y-1 text-xs text-gray-700">
                  <li className="flex items-center space-x-2">
                    <User className="w-3 h-3 text-gray-500" />
                    <span><strong>My Profile</strong> - Update your account settings</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <MessageSquare className="w-3 h-3 text-gray-500" />
                    <span><strong>My Conversations</strong> - View all your AI chat history</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Calendar className="w-3 h-3 text-gray-500" />
                    <span><strong>My Study Plan</strong> - Create and track study schedules</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
            <p className="text-xs text-blue-900">
              <strong>💡 Quick Tip:</strong> On mobile, the hamburger menu contains all navigation items including grade levels and subject selection!
            </p>
          </div>
        </div>
      )
    },
    {
      title: 'AI-Powered Study Planning',
      subtitle: 'Let AI organize your study schedule',
      content: (
        <div className="space-y-3">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-start space-x-3">
              <div className="bg-blue-600 p-2 rounded-lg flex-shrink-0">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">Smart Study Plans</h3>
                <p className="text-xs text-gray-700 mb-3">
                  Create personalized study schedules with AI assistance:
                </p>
                <ul className="space-y-2 text-xs text-gray-700">
                  <li className="flex items-start space-x-2">
                    <ChevronRight className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Exam Date</strong> - Set your target exam date</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <ChevronRight className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Subject & Syllabus</strong> - Choose what to study</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <ChevronRight className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Study Hours</strong> - Tell us how much time you have</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <ChevronRight className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span><strong>AI Generation</strong> - Get a smart schedule tailored to you</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-green-50 rounded-xl p-3 border border-green-200">
            <p className="text-xs text-green-900 mb-2">
              <strong>📊 Track Your Progress:</strong>
            </p>
            <ul className="space-y-1 text-xs text-gray-700">
              <li>• Mark sessions as completed, in progress, or skipped</li>
              <li>• Add notes to track what you've learned</li>
              <li>• View today's tasks right from your conversations page</li>
            </ul>
          </div>

          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
            <p className="text-xs text-amber-900">
              <strong>💡 Pro Tip:</strong> Access your study plan from the hamburger menu (top-right) → <strong>My Study Plan</strong>
            </p>
          </div>
        </div>
      )
    }
  ];

  const currentStepData = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-slideIn relative max-h-[90vh] flex flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-white hover:text-gray-200 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-700 p-4 text-white flex-shrink-0">
          <div className="flex items-center justify-center mb-2">
            <div className="bg-white bg-opacity-20 p-2 rounded-full">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <h2 className="text-lg font-bold text-center mb-1">{currentStepData.title}</h2>
          <p className="text-gray-300 text-center text-xs">
            {currentStepData.subtitle}
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center space-x-2 py-3 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-2 rounded-full transition-all ${
                index === currentStep
                  ? 'w-8 bg-gray-900'
                  : index < currentStep
                  ? 'w-2 bg-gray-400'
                  : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Content - Scrollable */}
        <div className="p-4 overflow-y-auto flex-1">
          {currentStepData.content}
        </div>

        {/* Footer - Navigation */}
        <div className="border-t border-gray-200 p-4 flex items-center justify-between bg-white flex-shrink-0">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-0 disabled:cursor-default"
          >
            Back
          </button>

          <div className="text-xs text-gray-500">
            {currentStep + 1} of {steps.length}
          </div>

          <button
            onClick={handleNext}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center space-x-1"
          >
            <span>{currentStep === steps.length - 1 ? 'Get Started' : 'Next'}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
