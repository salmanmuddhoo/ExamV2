import { useEffect } from 'react';
import { ArrowLeft, Clock, Calendar, User, Tag } from 'lucide-react';
import { BlogPost as BlogPostType } from '../data/blogPosts';

interface Props {
  post: BlogPostType;
  onBack: () => void;
}

export function BlogPost({ post, onBack }: Props) {
  // Scroll to top when post loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [post.id]);

  // Update page title and meta description for SEO
  useEffect(() => {
    document.title = `${post.title} | Aixampapers Blog`;

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', post.metaDescription);
    }

    // Update meta keywords
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
      metaKeywords.setAttribute('content', post.keywords.join(', '));
    }

    // Update canonical URL
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.setAttribute('href', `https://aixampapers.com/blog/${post.slug}`);
    }

    // Cleanup - restore original meta tags when component unmounts
    return () => {
      document.title = 'Cambridge Exam Papers with AI Tutor | Aixampapers Mauritius';
      if (metaDescription) {
        metaDescription.setAttribute('content', 'Access Cambridge IGCSE, O Level & A Level past exam papers in Mauritius. Free AI tutor helps you solve questions step-by-step. 1000+ past papers for Maths, Physics, Chemistry & more.');
      }
      if (canonical) {
        canonical.setAttribute('href', 'https://aixampapers.com');
      }
    };
  }, [post]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with back button */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <button
            onClick={onBack}
            className="inline-flex items-center text-gray-600 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            <span className="font-medium">Back to Blog</span>
          </button>
        </div>
      </div>

      {/* Article content */}
      <article className="max-w-4xl mx-auto px-4 py-8">
        {/* Featured badge */}
        {post.featured && (
          <div className="inline-flex items-center px-3 py-1 bg-black text-white text-sm font-medium rounded-full mb-4">
            ⭐ Featured Post
          </div>
        )}

        {/* Category badge */}
        <div className="flex items-center space-x-2 mb-4">
          <Tag className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{post.category}</span>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
          {post.title}
        </h1>

        {/* Meta information */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-6 pb-6 border-b border-gray-200">
          <div className="flex items-center">
            <User className="w-4 h-4 mr-2" />
            <span>{post.author}</span>
          </div>
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-2" />
            <span>{new Date(post.publishDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</span>
          </div>
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-2" />
            <span>{post.readTime}</span>
          </div>
        </div>

        {/* Featured image placeholder */}
        <div className="mb-8 rounded-xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 aspect-[16/9] flex items-center justify-center">
          <div className="text-center p-8">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-gray-600 font-medium">{post.imageAlt}</p>
          </div>
        </div>

        {/* Excerpt */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-8 rounded-r-lg">
          <p className="text-lg text-gray-800 leading-relaxed">
            {post.excerpt}
          </p>
        </div>

        {/* Blog content with custom styles */}
        <div
          className="blog-content prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Tags */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Related Keywords:</h3>
          <div className="flex flex-wrap gap-2">
            {post.keywords.map((keyword, index) => (
              <span
                key={index}
                className="inline-block px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>

        {/* Author bio */}
        <div className="mt-12 p-6 bg-white rounded-xl border border-gray-200">
          <div className="flex items-start space-x-4">
            <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              A
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{post.author}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                The Aixampapers team is dedicated to helping students in Mauritius and worldwide excel in their Cambridge exams. We combine AI technology with proven study strategies to make exam preparation more effective and affordable.
              </p>
            </div>
          </div>
        </div>

        {/* CTA at the end of post */}
        <div className="mt-12 p-8 bg-gradient-to-br from-black to-gray-800 rounded-2xl text-white">
          <h3 className="text-2xl font-bold mb-4">Ready to Ace Your Cambridge Exams?</h3>
          <p className="text-gray-200 mb-6 leading-relaxed">
            Access 1000+ Cambridge past papers with instant AI tutoring. Get step-by-step help on every question, 24/7.
          </p>
          <button
            onClick={onBack}
            className="inline-flex items-center px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 transition-colors"
          >
            Browse Past Papers
            <ArrowLeft className="w-5 h-5 ml-2 rotate-180" />
          </button>
        </div>
      </article>

      {/* Custom styles for blog content */}
      <style>{`
        .blog-content {
          color: #1f2937;
        }

        .blog-content h1 {
          font-size: 2.25rem;
          font-weight: 700;
          margin-top: 2rem;
          margin-bottom: 1.5rem;
          line-height: 1.2;
        }

        .blog-content h2 {
          font-size: 1.875rem;
          font-weight: 700;
          margin-top: 3rem;
          margin-bottom: 1.25rem;
          color: #111827;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 0.5rem;
        }

        .blog-content h3 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 2rem;
          margin-bottom: 1rem;
          color: #1f2937;
        }

        .blog-content h4 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          color: #374151;
        }

        .blog-content p {
          margin-bottom: 1.25rem;
          line-height: 1.8;
          font-size: 1.0625rem;
        }

        .blog-content .lead {
          font-size: 1.25rem;
          line-height: 1.75;
          color: #374151;
          margin-bottom: 2rem;
          font-weight: 400;
        }

        .blog-content ul, .blog-content ol {
          margin-bottom: 1.5rem;
          padding-left: 1.5rem;
        }

        .blog-content li {
          margin-bottom: 0.5rem;
          line-height: 1.7;
        }

        .blog-content strong {
          font-weight: 600;
          color: #111827;
        }

        .blog-content a {
          color: #2563eb;
          text-decoration: underline;
          font-weight: 500;
        }

        .blog-content a:hover {
          color: #1d4ed8;
        }

        .blog-content table {
          width: 100%;
          margin: 2rem 0;
          border-collapse: collapse;
          background: white;
          border-radius: 0.5rem;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .blog-content th {
          background: #111827;
          color: white;
          padding: 1rem;
          text-align: left;
          font-weight: 600;
        }

        .blog-content td {
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .blog-content tr:last-child td {
          border-bottom: none;
        }

        .blog-content blockquote {
          border-left: 4px solid #2563eb;
          padding-left: 1.5rem;
          margin: 2rem 0;
          font-style: italic;
          color: #4b5563;
          background: #f9fafb;
          padding: 1.5rem;
          border-radius: 0.5rem;
        }

        .blog-content .paper-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 1rem;
          padding: 2rem;
          margin: 2rem 0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .blog-content .paper-header {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .blog-content .subject-badge {
          display: inline-block;
          padding: 0.25rem 1rem;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .blog-content .subject-badge.mathematics {
          background: #dbeafe;
          color: #1e40af;
        }

        .blog-content .subject-badge.physics {
          background: #fef3c7;
          color: #92400e;
        }

        .blog-content .subject-badge.chemistry {
          background: #dcfce7;
          color: #14532d;
        }

        .blog-content .difficulty-badge {
          display: inline-block;
          padding: 0.25rem 1rem;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 600;
          background: #f3f4f6;
          color: #374151;
        }

        .blog-content .pro-tip {
          background: #fef3c7;
          border: 2px solid #fbbf24;
          padding: 1rem 1.5rem;
          border-radius: 0.5rem;
          margin: 1.5rem 0;
        }

        .blog-content .cta-box {
          background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
          color: white;
          padding: 2.5rem;
          border-radius: 1rem;
          margin: 3rem 0;
        }

        .blog-content .cta-box h3 {
          color: white;
          margin-top: 0;
        }

        .blog-content .cta-button {
          display: inline-block;
          background: white;
          color: #1e40af;
          padding: 1rem 2rem;
          border-radius: 0.5rem;
          font-weight: 600;
          text-decoration: none;
          margin-top: 1rem;
        }

        .blog-content .cta-button:hover {
          background: #f3f4f6;
        }

        .blog-content .key-takeaway {
          background: #e0f2fe;
          border: 2px solid #0284c7;
          padding: 1.5rem;
          border-radius: 0.75rem;
          margin: 2rem 0;
        }

        .blog-content .key-takeaway h4 {
          color: #0c4a6e;
          margin-top: 0;
        }

        .blog-content .final-note {
          font-size: 1.125rem;
          font-weight: 500;
          color: #1f2937;
          padding: 1.5rem;
          background: #f9fafb;
          border-radius: 0.5rem;
          margin-top: 2rem;
        }

        .blog-content .author-bio {
          font-style: italic;
          color: #6b7280;
          font-size: 0.9375rem;
          margin-top: 1rem;
        }
      `}</style>
    </div>
  );
}
