import { BookOpen, Brain, Lock, Zap, CheckCircle, ArrowRight, Sparkles, Crown, Rocket, Star } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  onGetStarted: () => void;
  onOpenSubscriptions?: () => void;
  isLoggedIn?: boolean;
}

interface TierConfig {
  name: string;
  display_name: string;
  price_monthly: number;
  token_limit: number | null;
  papers_limit: number | null;
  chapter_wise_access: boolean;
}

export function Homepage({ onGetStarted, onOpenSubscriptions, isLoggedIn = false }: Props) {
  const [tiers, setTiers] = useState<{
    free?: TierConfig;
    student_lite?: TierConfig;
    student?: TierConfig;
    pro?: TierConfig;
  }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTiers();
  }, []);

  const fetchTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_tiers')
        .select('name, display_name, price_monthly, token_limit, papers_limit, chapter_wise_access')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      const tiersMap: any = {};
      data?.forEach(tier => {
        tiersMap[tier.name] = tier;
      });
      setTiers(tiersMap);
    } catch (error) {
      console.error('Error fetching tiers:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number | null) => {
    if (num === null) return 'Unlimited';
    if (num >= 1000) return `${(num / 1000).toLocaleString()}K`;
    return num.toLocaleString();
  };
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        
        <div className="max-w-7xl mx-auto px-4 py-16 sm:py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Content */}
            <div className="text-center lg:text-left z-10">
              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-full text-sm font-medium mb-6 shadow-lg">
                <Sparkles className="w-4 h-4" />
                <span>AI-Powered Study Assistant</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 mb-6 leading-tight">
                Master Your Exams with
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600">
                  Smart AI Help
                </span>
              </h1>
              
              <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                Access past exam papers with an intelligent AI tutor that guides you through every question, providing detailed explanations and personalized learning support.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button
                  onClick={onGetStarted}
                  className="group inline-flex items-center justify-center space-x-2 px-8 py-4 bg-black text-white rounded-xl hover:bg-gray-800 transition-all text-lg font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <span>Get Started Free</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                
                <button className="inline-flex items-center justify-center space-x-2 px-8 py-4 bg-white text-gray-900 rounded-xl hover:bg-gray-50 transition-all text-lg font-semibold border-2 border-gray-200">
                  <span>Watch Demo</span>
                </button>
              </div>
              
              <div className="mt-8 flex items-center justify-center lg:justify-start space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  
                  
                </div>
                <div className="flex items-center space-x-2">
                </div>
              </div>
            </div>

            {/* Right - iPhone with Animation */}
            <div className="relative flex justify-center lg:justify-end">
              <IPhoneHero />
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-20 right-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute bottom-20 left-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
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

      {/* Pricing Section */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-16 sm:py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Choose Your Plan
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Start free and upgrade anytime. All plans include access to our comprehensive exam library and AI tutor.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-6 max-w-7xl mx-auto">
            {/* Free Tier */}
            {!loading && tiers.free && (
              <PricingCard
                name={tiers.free.display_name}
                price="$0"
                period="forever"
                description="Perfect for trying out the platform"
                icon={<BookOpen className="w-6 h-6" />}
                features={[
                  `Access to ${formatNumber(tiers.free.papers_limit)} exam paper${tiers.free.papers_limit !== 1 ? 's' : ''}`,
                  `${formatNumber(tiers.free.token_limit)} AI tokens per month`,
                  "Basic AI assistance",
                  "Yearly & Chapter practice",
                  "No credit card required"
                ]}
                buttonText="Get Started Free"
                onButtonClick={onGetStarted}
                popular={false}
              />
            )}

            {/* Student Lite Package */}
            {!loading && tiers.student_lite && (
              <PricingCard
                name={tiers.student_lite.display_name}
                price={`$${tiers.student_lite.price_monthly.toFixed(2)}`}
                period="per month"
                description="Affordable yearly exam focus"
                icon={<Rocket className="w-6 h-6" />}
                features={[
                  "Choose 1 grade level",
                  "Select 1 subject",
                  "Yearly exam papers only",
                  `${formatNumber(tiers.student_lite.token_limit)} AI tokens per month`,
                  "AI chat assistance",
                  "Most affordable option"
                ]}
                buttonText="Start Learning"
                onButtonClick={isLoggedIn && onOpenSubscriptions ? onOpenSubscriptions : onGetStarted}
                popular={true}
              />
            )}

            {/* Student Package */}
            {!loading && tiers.student && (
              <PricingCard
                name={tiers.student.display_name}
                price={`$${tiers.student.price_monthly.toFixed(2)}`}
                period="per month"
                description="Best for comprehensive learning"
                icon={<Star className="w-6 h-6" />}
                features={[
                  "Choose 1 grade level",
                  "Select up to 3 subjects",
                  "Yearly & Chapter practice",
                  `${formatNumber(tiers.student.token_limit)} AI tokens per month`,
                  "Priority AI responses",
                  "Download exam papers"
                ]}
                buttonText="Get Full Access"
                onButtonClick={isLoggedIn && onOpenSubscriptions ? onOpenSubscriptions : onGetStarted}
                popular={false}
              />
            )}

            {/* Premium */}
            {!loading && tiers.pro && (
              <PricingCard
                name={tiers.pro.display_name}
                price={`$${tiers.pro.price_monthly.toFixed(2)}`}
                period="per month"
                description="Everything you need to excel"
                icon={<Crown className="w-6 h-6" />}
                features={[
                  "All grades & subjects",
                  "Yearly & Chapter practice",
                  `${formatNumber(tiers.pro.token_limit)} AI tokens`,
                  "Advanced AI explanations",
                  "Detailed progress tracking",
                  "Priority support"
                ]}
                buttonText="Go Premium"
                onButtonClick={isLoggedIn && onOpenSubscriptions ? onOpenSubscriptions : onGetStarted}
                popular={false}
              />
            )}
          </div>

          {/* FAQ or Additional Info */}
          <div className="mt-12 text-center">
            <p className="text-sm text-gray-600">
              All plans include full access to our AI tutor and comprehensive exam library. Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
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
            <div className="bg-gray-50 rounded-lg p-8 border border-gray-200">
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="bg-black text-white rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 font-bold">
                    ?
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium mb-1">Student Question</p>
                    <p className="text-gray-600 text-sm">How do I solve question 3 part (a)?</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="bg-gray-100 text-gray-900 rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium mb-1">AI Tutor Response</p>
                    <p className="text-gray-600 text-sm">
                      Let me break down question 3(a) for you. First, identify the key information given...
                    </p>
                  </div>
                </div>
              </div>
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

interface PricingCardProps {
  name: string;
  price: string;
  period: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  buttonText: string;
  onButtonClick: () => void;
  popular?: boolean;
}

function PricingCard({
  name,
  price,
  period,
  description,
  icon,
  features,
  buttonText,
  onButtonClick,
  popular = false
}: PricingCardProps) {
  return (
    <div className={`relative rounded-2xl border-2 ${
      popular
        ? 'border-black shadow-2xl scale-105 bg-white'
        : 'border-gray-200 bg-white shadow-lg'
    } p-8 transition-all hover:shadow-xl`}>
      {popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-wide shadow-lg">
            Most Popular
          </div>
        </div>
      )}

      <div className="text-center mb-6">
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4 ${
          popular ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white' : 'bg-gray-100 text-gray-900'
        }`}>
          {icon}
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">{name}</h3>
        <p className="text-sm text-gray-600 mb-4">{description}</p>
        <div className="flex items-baseline justify-center">
          <span className="text-5xl font-bold text-gray-900">{price}</span>
          <span className="text-gray-600 ml-2">/ {period}</span>
        </div>
      </div>

      <button
        onClick={onButtonClick}
        className={`w-full py-3 px-6 rounded-xl font-semibold transition-all mb-6 ${
          popular
            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl'
            : 'bg-gray-900 text-white hover:bg-gray-800'
        }`}
      >
        {buttonText}
      </button>

      <div className="space-y-3">
        {features.map((feature, index) => (
          <div key={index} className="flex items-start space-x-3">
            <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              popular ? 'text-blue-600' : 'text-gray-900'
            }`} />
            <span className="text-sm text-gray-700">{feature}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IPhoneHero() {
  return (
    <div className="relative flex justify-center lg:justify-end">
      <div className="relative w-[320px] h-[650px] rounded-[40px] overflow-hidden shadow-2xl border-4 border-gray-900">
        {/* Replace the src below with your own image path */}
        <img
          src="/your-image.jpg"
          alt="App preview"
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  );
}


// Add custom animations via inline style
const style = document.createElement('style');
style.textContent = `
  @keyframes blob {
    0%, 100% { transform: translate(0, 0) scale(1); }
    25% { transform: translate(20px, -20px) scale(1.1); }
    50% { transform: translate(-20px, 20px) scale(0.9); }
    75% { transform: translate(20px, 20px) scale(1.05); }
  }
  
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-blob {
    animation: blob 7s infinite;
  }
  
  .animation-delay-2000 {
    animation-delay: 2s;
  }
  
  .animate-slideIn {
    animation: slideIn 0.5s ease-out forwards;
  }
  
  .animation-delay-300 {
    animation-delay: 0.3s;
  }
  
  .animation-delay-600 {
    animation-delay: 0.6s;
  }
  
  .animation-delay-900 {
    animation-delay: 0.9s;
  }
  
  .bg-grid-pattern {
    background-image: 
      linear-gradient(to right, rgb(0 0 0 / 0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgb(0 0 0 / 0.05) 1px, transparent 1px);
    background-size: 40px 40px;
  }
`;
document.head.appendChild(style);