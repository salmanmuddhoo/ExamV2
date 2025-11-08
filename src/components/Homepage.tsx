import { BookOpen, Brain, Lock, Zap, CheckCircle, ArrowRight, Sparkles, Crown, Rocket, Star, ChevronLeft, ChevronRight, Smartphone, Calendar, TrendingUp, Clock, FolderTree, BarChart3, Cpu } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { formatTokenCount } from '../lib/formatUtils';
import { formatPrice } from '../utils/currency';

interface Props {
  onGetStarted: () => void;
  onOpenSubscriptions?: () => void;
  isLoggedIn?: boolean;
}

interface TierConfig {
  name: string;
  display_name: string;
  price_monthly: number;
  currency: string;
  token_limit: number | null;
  papers_limit: number | null;
  chapter_wise_access: boolean;
  max_subjects: number | null;
  coming_soon: boolean;
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
        .select('name, display_name, price_monthly, currency, token_limit, papers_limit, chapter_wise_access, max_subjects, coming_soon')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      const tiersMap: any = {};
      data?.forEach(tier => {
        tiersMap[tier.name] = tier;
      });
      setTiers(tiersMap);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  // Format numbers for papers (keep simple K formatting)
  const formatNumber = (num: number | null) => {
    if (num === null) return 'Unlimited';
    if (num >= 1000) return `${(num / 1000).toLocaleString()}K`;
    return num.toLocaleString();
  };

  // Format subject count for display
  const formatSubjects = (count: number | null) => {
    if (count === null) return 'All subjects';
    if (count === 1) return 'Select 1 subject';
    return `Select up to ${count} subjects`;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        
        <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12 lg:py-16">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left Content */}
            <div className="text-center lg:text-left z-10">
              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-full text-sm font-medium mb-4 shadow-lg">
                <Sparkles className="w-4 h-4" />
                <span>AI-Powered Study Assistant</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 mb-4 leading-tight">
                Master Your Exams with
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600">
                  AixamPapers
                </span>
              </h1>
              
              <p className="text-lg sm:text-xl text-gray-600 mb-6 leading-relaxed max-w-xl mx-auto lg:mx-0">
                Practice exam papers anywhere, anytime with <span className="font-semibold text-gray-900">advanced AI tutors</span>. Get AI-generated Study Plans, organized chapter-wise content, and track your progress with detailed explanations for every question.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button
                  onClick={onGetStarted}
                  className="group inline-flex items-center justify-center space-x-2 px-8 py-4 bg-black text-white rounded-xl hover:bg-gray-800 transition-all text-lg font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <span>Get Started Free</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                



                
              </div>
              
              <div className="mt-8 flex items-center justify-center lg:justify-start space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  
                  
                </div>
                <div className="flex items-center space-x-2">
                </div>
              </div>
            </div>

            {/* Right - App Screenshot Slider */}
            <div className="relative flex justify-center lg:justify-end">
              <AppScreenshotSlider />
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-20 right-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute bottom-20 left-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      </section>

      {/* Features Section */}
      <section className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-8">
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
              title="Intelligent AI Tutors"
              description="Get instant, intelligent responses with step-by-step explanations tailored to your learning style from our advanced AI tutoring system."
            />
            <FeatureCard
              icon={<Zap className="w-8 h-8" />}
              title="Interactive Study Experience"
              description="View exam papers alongside AI chat. Ask questions, request clarifications, and learn at your own pace."
            />
          </div>
        </div>
      </section>

      {/* Advanced Features Section */}
      <section className="border-b border-gray-200 bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Smart Features That Make Learning Easy
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Our platform is designed with cutting-edge technology to provide you with the best exam preparation experience
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* AI-Powered Learning */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-8 hover:shadow-xl transition-all">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl mb-6">
                <Cpu className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">AI-Powered Tutoring</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Experience intelligent, adaptive learning with our state-of-the-art AI technology. Get personalized explanations and step-by-step guidance tailored to your understanding level.
              </p>
              <div className="space-y-3">
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                  <span className="text-gray-700">Instant, detailed explanations</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                  <span className="text-gray-700">Adapts to your learning style</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-2 h-2 bg-pink-600 rounded-full"></div>
                  <span className="text-gray-700">Available 24/7 for your questions</span>
                </div>
              </div>
            </div>

            {/* Organized Exam Papers */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-8 hover:shadow-xl transition-all">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl mb-6">
                <FolderTree className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Smart Paper Organization</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                When you chat with our AI, all exam papers are automatically organized by chapters. Simply select which chapter you're studying, and the AI focuses on that specific content.
              </p>
              <div className="space-y-3">
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                  <span className="text-gray-700">Chapter-by-chapter navigation</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full"></div>
                  <span className="text-gray-700">AI understands your current topic</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-2 h-2 bg-teal-600 rounded-full"></div>
                  <span className="text-gray-700">Focus on what matters most</span>
                </div>
              </div>
            </div>

            {/* Study Plan Progress Tracking */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-8 hover:shadow-xl transition-all">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl mb-6">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">AI-Generated Study Plans</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Let AI create a personalized study schedule based on your syllabus. Track every session, mark tasks complete, and visualize your progress with an interactive calendar.
              </p>
              <div className="space-y-3">
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-2 h-2 bg-orange-600 rounded-full"></div>
                  <span className="text-gray-700">Automatic schedule generation</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                  <span className="text-gray-700">Visual progress tracking</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="w-2 h-2 bg-rose-600 rounded-full"></div>
                  <span className="text-gray-700">Stay organized and on track</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-8">
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

      {/* Study On The Go Section */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Study Anywhere, Anytime
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Take control of your exam preparation with flexible tools designed for students on the go
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-white p-6 rounded-2xl border border-gray-200 hover:shadow-lg transition-shadow">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-xl mb-4">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Practice On The Go</h3>
              <p className="text-gray-600 leading-relaxed">
                Access exam papers and AI assistance from any device. Study during commutes, breaks, or whenever inspiration strikes.
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-white p-6 rounded-2xl border border-gray-200 hover:shadow-lg transition-shadow">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-600 text-white rounded-xl mb-4">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">AI Study Plans</h3>
              <p className="text-gray-600 leading-relaxed">
                Let AI automatically generate a personalized study schedule based on your syllabus and chapters. Your smart calendar adapts to your learning goals.
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-white p-6 rounded-2xl border border-gray-200 hover:shadow-lg transition-shadow">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-600 text-white rounded-xl mb-4">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Visual Progress Tracking</h3>
              <p className="text-gray-600 leading-relaxed">
                Mark study sessions complete, track overdue tasks with alerts, and watch your progress grow with interactive charts and completion percentages.
              </p>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-white p-6 rounded-2xl border border-gray-200 hover:shadow-lg transition-shadow">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-orange-600 text-white rounded-xl mb-4">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Learn At Your Pace</h3>
              <p className="text-gray-600 leading-relaxed">
                No pressure, no deadlines. Study when you're ready, take breaks when you need, and resume exactly where you left off.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:py-16">
          <div className="text-center mb-10">
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
                description="Perfect for trying out the platform"
                icon={<BookOpen className="w-6 h-6" />}
                features={[
                  `Access Ai assistant for ${formatNumber(tiers.free.papers_limit)} exam paper${tiers.free.papers_limit !== 1 ? 's' : ''}`,
                  `${formatTokenCount(tiers.free.token_limit)} AI tokens per month`,
                  "Yearly practice",
                  "No credit card required"
                ]}
                buttonText={tiers.free.coming_soon ? "Coming Soon" : "Get Started Free"}
                onButtonClick={tiers.free.coming_soon ? undefined : onGetStarted}
                popular={false}
                comingSoon={tiers.free.coming_soon}
              />
            )}

            {/* Student Lite Package */}
            {!loading && tiers.student_lite && (
              <PricingCard
                name={tiers.student_lite.display_name}
                price={formatPrice(tiers.student_lite.price_monthly, tiers.student_lite.currency)}
                period="per month"
                description="Affordable yearly exam focus"
                icon={<Rocket className="w-6 h-6" />}
                features={[
                  "Choose 1 grade level",
                  formatSubjects(tiers.student_lite.max_subjects),
                  "Yearly & Chapter-wise practice",
                  `${formatTokenCount(tiers.student_lite.token_limit)} AI tokens per month`,
                  "Study Plan"
                ]}
                buttonText={tiers.student_lite.coming_soon ? "Coming Soon" : "Start Learning"}
                onButtonClick={tiers.student_lite.coming_soon ? undefined : (isLoggedIn && onOpenSubscriptions ? onOpenSubscriptions : onGetStarted)}
                popular={true}
                comingSoon={tiers.student_lite.coming_soon}
              />
            )}

            {/* Student Package */}
            {!loading && tiers.student && (
              <PricingCard
                name={tiers.student.display_name}
                price={formatPrice(tiers.student.price_monthly, tiers.student.currency)}
                period="per month"
                description="Best for comprehensive learning"
                icon={<Star className="w-6 h-6" />}
                features={[
                  "Choose 1 grade level",
                  formatSubjects(tiers.student.max_subjects),
                  "Yearly & Chapter-wise practice",
                  `${formatTokenCount(tiers.student.token_limit)} AI tokens per month`,
                  "Study Plan"
                ]}
                buttonText={tiers.student.coming_soon ? "Coming Soon" : "Get Full Access"}
                onButtonClick={tiers.student.coming_soon ? undefined : (isLoggedIn && onOpenSubscriptions ? onOpenSubscriptions : onGetStarted)}
                popular={false}
                comingSoon={tiers.student.coming_soon}
              />
            )}

            {/* Premium */}
            {!loading && tiers.pro && (
              <PricingCard
                name={tiers.pro.display_name}
                price={formatPrice(tiers.pro.price_monthly, tiers.pro.currency)}
                period="per month"
                description="Everything you need to excel"
                icon={<Crown className="w-6 h-6" />}
                features={[
                  "All grades & subjects",
                  "Yearly & Chapter-wise practice",
                  `${formatTokenCount(tiers.pro.token_limit)} AI tokens`,
                  "Study Plan"
                ]}
                buttonText={tiers.pro.coming_soon ? "Coming Soon" : "Go Premium"}
                onButtonClick={tiers.pro.coming_soon ? undefined : (isLoggedIn && onOpenSubscriptions ? onOpenSubscriptions : onGetStarted)}
                popular={false}
                comingSoon={tiers.pro.coming_soon}
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
                <Benefit text="Practice with real past exam papers" />
                <Benefit text="No downloads required - everything works in your browser" />
                <Benefit text="Free access to all exam papers" />
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
  price?: string; // Optional - for free tier
  period?: string; // Optional - for free tier
  description: string;
  icon: React.ReactNode;
  features: string[];
  buttonText: string;
  onButtonClick?: () => void; // Optional - for coming soon tiers
  popular?: boolean;
  comingSoon?: boolean; // True if tier is coming soon
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
  popular = false,
  comingSoon = false
}: PricingCardProps) {
  return (
    <div className={`relative rounded-2xl border-2 ${
      popular
        ? 'border-black shadow-2xl bg-white'
        : 'border-gray-200 bg-white shadow-lg'
    } p-8 transition-all hover:shadow-xl flex flex-col h-full`}>
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
        {price && !comingSoon && (
          <div className="flex items-baseline justify-center">
            <span className="text-5xl font-bold text-gray-900">{price}</span>
            {period && <span className="text-gray-600 ml-2">/ {period}</span>}
          </div>
        )}
      </div>

      <div className="space-y-3 mb-6 flex-grow">
        {features.map((feature, index) => (
          <div key={index} className="flex items-start space-x-3">
            <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              popular ? 'text-blue-600' : 'text-gray-900'
            }`} />
            <span className="text-sm text-gray-700">{feature}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onButtonClick}
        className={`w-full py-3 px-6 rounded-xl font-semibold transition-all ${
          comingSoon
            ? 'bg-yellow-500 text-gray-900 cursor-default'
            : popular
            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl'
            : 'bg-gray-900 text-white hover:bg-gray-800'
        }`}
      >
        {buttonText}
      </button>
    </div>
  );
}

// Image slider for desktop and mobile app views
function AppScreenshotSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [imageErrors, setImageErrors] = useState<{ [key: number]: boolean }>({});

  const slides = [
    {
      title: 'Desktop View',
      description: 'Full-featured experience on desktop',
      image: '/assets/laptop.png',
      isDesktop: true,
    },
    {
      title: 'Mobile View',
      description: 'Study on-the-go with our mobile web app',
      image: '/assets/iphone.png',
      isDesktop: false,
    },
    {
      title: 'AI Study Plan',
      description: 'Personalized schedules with intelligent planning',
      image: '/assets/study-plan.png',
      isDesktop: true,
    },
  ];

  useEffect(() => {
    // Auto-advance slides every 5 seconds
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [slides.length]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const handleImageError = (index: number) => {
    setImageErrors(prev => ({ ...prev, [index]: true }));
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Screenshot Frame with Border */}
      <div className="relative bg-white rounded-2xl shadow-2xl border-4 border-black overflow-hidden">
        {/* Slider Container */}
        <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
          {slides.map((slide, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                index === currentSlide
                  ? 'opacity-100 translate-x-0'
                  : index < currentSlide
                  ? 'opacity-0 -translate-x-full'
                  : 'opacity-0 translate-x-full'
              }`}
            >
              {/* Try to load actual screenshot, fallback to placeholder */}
              {!imageErrors[index] ? (
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                  onError={() => handleImageError(index)}
                />
              ) : (
                /* Placeholder for missing images */
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                  <div className="text-center p-4 sm:p-8">
                    <div className={`mx-auto mb-4 ${slide.isDesktop ? 'w-16 h-16 sm:w-24 sm:h-24' : 'w-12 h-24 sm:w-16 sm:h-32'} bg-black rounded-lg flex items-center justify-center`}>
                      {slide.isDesktop ? (
                        <svg className="w-8 h-8 sm:w-12 sm:h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="2" />
                          <path d="M8 21h8" strokeWidth="2" strokeLinecap="round" />
                          <path d="M12 17v4" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-10 sm:w-8 sm:h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <rect x="5" y="2" width="14" height="20" rx="2" strokeWidth="2" />
                          <path d="M12 18h.01" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      )}
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{slide.title}</h3>
                    <p className="text-sm sm:text-base text-gray-600">{slide.description}</p>
                    <p className="mt-4 text-xs sm:text-sm text-gray-500">
                      Add {slide.image} to display screenshot
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black text-white p-1.5 sm:p-2 rounded-full transition-all z-10"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black text-white p-1.5 sm:p-2 rounded-full transition-all z-10"
          aria-label="Next slide"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* Slide Indicators */}
        <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`h-1.5 sm:h-2 rounded-full transition-all ${
                index === currentSlide
                  ? 'bg-black w-6 sm:w-8'
                  : 'bg-black/30 w-1.5 sm:w-2 hover:bg-black/50'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Caption below frame */}
      <div className="mt-4 sm:mt-6 text-center">
        <p className="text-xs sm:text-sm text-gray-600">
          {slides[currentSlide].description}
        </p>
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
