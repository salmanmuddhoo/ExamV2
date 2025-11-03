import { useState } from 'react';
import { BookOpen, Clock, Calendar, ArrowRight, Search, Tag } from 'lucide-react';
import { blogPosts, BlogPost as BlogPostType } from '../data/blogPosts';

interface Props {
  onSelectPost: (post: BlogPostType) => void;
  onBack: () => void;
}

export function BlogList({ onSelectPost, onBack }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Get unique categories
  const categories = ['all', ...Array.from(new Set(blogPosts.map(post => post.category)))];

  // Filter posts based on search and category
  const filteredPosts = blogPosts.filter(post => {
    const matchesSearch =
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || post.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Featured posts
  const featuredPosts = filteredPosts.filter(post => post.featured);
  const regularPosts = filteredPosts.filter(post => !post.featured);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-black via-gray-900 to-gray-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-20">
          <div className="text-center">
            <div className="inline-flex items-center px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium mb-6">
              <BookOpen className="w-4 h-4 mr-2" />
              <span>Cambridge Exam Study Resources</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Cambridge Exam Prep Blog
            </h1>

            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8 leading-relaxed">
              Expert tips, study strategies, and resources to help you ace your IGCSE, O Level, and A Level exams.
              Written for students in Mauritius and worldwide.
            </p>

            {/* Search bar */}
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search articles... (e.g., 'IGCSE Mathematics', 'study tips')"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Category filters */}
        <div className="flex items-center space-x-3 mb-8 overflow-x-auto pb-2">
          <Tag className="w-5 h-5 text-gray-500 flex-shrink-0" />
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === category
                  ? 'bg-black text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {category === 'all' ? 'All Articles' : category}
            </button>
          ))}
        </div>

        {/* Results count */}
        {searchQuery && (
          <p className="text-gray-600 mb-6">
            Found <strong>{filteredPosts.length}</strong> article{filteredPosts.length !== 1 ? 's' : ''} matching "{searchQuery}"
          </p>
        )}

        {/* Featured posts */}
        {featuredPosts.length > 0 && selectedCategory === 'all' && !searchQuery && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="mr-2">⭐</span>
              Featured Articles
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {featuredPosts.map(post => (
                <article
                  key={post.id}
                  onClick={() => onSelectPost(post)}
                  className="group bg-white rounded-2xl overflow-hidden border border-gray-200 hover:shadow-xl transition-all cursor-pointer"
                >
                  {/* Image placeholder */}
                  <div className="aspect-[16/9] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative overflow-hidden">
                    <div className="text-center p-6 group-hover:scale-105 transition-transform">
                      <div className="text-5xl mb-3">📚</div>
                      <p className="text-sm text-gray-600 font-medium">{post.imageAlt}</p>
                    </div>
                    <div className="absolute top-4 right-4 bg-black text-white px-3 py-1 rounded-full text-xs font-semibold">
                      Featured
                    </div>
                  </div>

                  <div className="p-6">
                    {/* Category badge */}
                    <div className="inline-block px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full mb-3">
                      {post.category}
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors line-clamp-2">
                      {post.title}
                    </h3>

                    <p className="text-gray-600 mb-4 line-clamp-3 leading-relaxed">
                      {post.excerpt}
                    </p>

                    {/* Meta info */}
                    <div className="flex items-center justify-between text-sm text-gray-500 border-t border-gray-100 pt-4">
                      <div className="flex items-center space-x-4">
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {new Date(post.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {post.readTime}
                        </span>
                      </div>

                      <span className="text-blue-600 font-medium group-hover:underline flex items-center">
                        Read More
                        <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* Regular posts */}
        {regularPosts.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {featuredPosts.length > 0 && selectedCategory === 'all' && !searchQuery ? 'More Articles' : 'All Articles'}
            </h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regularPosts.map(post => (
                <article
                  key={post.id}
                  onClick={() => onSelectPost(post)}
                  className="group bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition-all cursor-pointer"
                >
                  {/* Image placeholder */}
                  <div className="aspect-[16/9] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative overflow-hidden">
                    <div className="text-center p-4 group-hover:scale-105 transition-transform">
                      <div className="text-4xl mb-2">📖</div>
                      <p className="text-xs text-gray-600">{post.category}</p>
                    </div>
                  </div>

                  <div className="p-5">
                    {/* Category badge */}
                    <div className="inline-block px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full mb-2">
                      {post.category}
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors line-clamp-2 leading-tight">
                      {post.title}
                    </h3>

                    <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">
                      {post.excerpt}
                    </p>

                    {/* Meta info */}
                    <div className="flex items-center text-xs text-gray-500 border-t border-gray-100 pt-3">
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {post.readTime}
                      </span>
                      <span className="mx-2">•</span>
                      <span>
                        {new Date(post.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {filteredPosts.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No articles found</h3>
            <p className="text-gray-600 mb-6">
              Try a different search term or category
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* CTA Section */}
        <div className="mt-16 p-8 md:p-12 bg-gradient-to-br from-black to-gray-800 rounded-2xl text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Practicing?</h2>
          <p className="text-gray-300 text-lg mb-6 max-w-2xl mx-auto">
            Access 1000+ Cambridge past papers with instant AI tutoring.
            Put these study tips into action and ace your exams!
          </p>
          <button
            onClick={onBack}
            className="inline-flex items-center px-8 py-4 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-colors text-lg"
          >
            Browse Past Papers
            <ArrowRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>

      {/* SEO content footer */}
      <div className="bg-white border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 text-sm text-gray-600">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Popular Topics</h3>
              <ul className="space-y-2">
                <li>• IGCSE Past Papers</li>
                <li>• O Level Study Tips</li>
                <li>• A Level Preparation</li>
                <li>• Cambridge Exam Strategies</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">For Mauritius Students</h3>
              <ul className="space-y-2">
                <li>• Past Papers Mauritius</li>
                <li>• Local Exam Resources</li>
                <li>• Study Groups</li>
                <li>• Exam Centers</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">AI Study Tools</h3>
              <ul className="space-y-2">
                <li>• AI Tutor Features</li>
                <li>• Practice Mode</li>
                <li>• Question Bank</li>
                <li>• Progress Tracking</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
