import { Button } from '@/components/ui/button';
import { ArrowRight, Clock, Sparkles, CheckCircle2, FileText, Zap, Star } from 'lucide-react';
import Link from 'next/link';
import { getUser } from '@/lib/db/queries';

export default async function HomePage() {
  const user = await getUser();
  const getStartedHref = user ? '/dashboard' : '/sign-up';
  const getStartedText = user ? 'Go to Dashboard' : 'Get Started';
  return (
    <main>
      {/* Hero Section */}
      <section className="relative py-20 sm:py-24 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-12 lg:gap-12 items-center">
            <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-6 lg:text-left">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                Master Your Course Material
                <span className="block text-orange-500 mt-2">With AI-Powered Quizzes</span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
                Upload your lecture slides and instantly generate practice quizzes. Test your knowledge, 
                identify weak spots, and ace your exams with personalized study tools.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 sm:max-w-lg sm:mx-auto lg:mx-0">
                <Button
                  size="lg"
                  className="text-lg px-8 py-6 h-auto bg-orange-500 hover:bg-orange-600 text-white shadow-lg hover:shadow-xl transition-all"
                  asChild
                >
                  <Link href={getStartedHref}>
                    {getStartedText}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-lg px-8 py-6 h-auto"
                  asChild
                >
                  <Link href="#benefits">
                    Learn More
                  </Link>
                </Button>
              </div>
            </div>
            <div className="mt-12 relative sm:max-w-lg sm:mx-auto lg:mt-0 lg:max-w-none lg:col-span-6">
              {/* Product Mockup/Illustration */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-orange-600 rounded-2xl blur-3xl opacity-20"></div>
                <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
                  <div className="space-y-6">
                    {/* Slide Preview */}
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-4">
                        <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">Lecture Slide</span>
                      </div>
                      <div className="h-32 bg-white dark:bg-gray-700 rounded p-4">
                        <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded w-3/4 mb-2"></div>
                        <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded w-full mb-2"></div>
                        <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded w-5/6"></div>
                      </div>
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex justify-center">
                      <div className="bg-orange-500 rounded-full p-3">
                        <ArrowRight className="h-6 w-6 text-white rotate-90" />
                      </div>
                    </div>
                    
                    {/* Quiz Preview */}
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-6 border border-orange-200 dark:border-orange-800">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        <span className="text-sm font-semibold text-orange-900 dark:text-orange-100">Generated Quiz</span>
                      </div>
                      <div className="space-y-3">
                        <div className="bg-white dark:bg-gray-700 rounded p-3">
                          <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded w-full mb-2"></div>
                          <div className="space-y-2">
                            <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded w-4/5"></div>
                            <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded w-3/5"></div>
                            <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded w-4/5"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* UVP Section */}
      <section className="py-16 bg-white dark:bg-gray-900 border-y border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 mb-6">
              <Zap className="h-8 w-8 text-orange-500" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
              Study Smarter, Not Harder
            </h2>
            <p className="mt-6 text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
              Transform your lecture slides into personalized practice quizzes in seconds. Our AI creates 
              comprehensive questions that help you understand concepts, not just memorize facts. Get instant 
              feedback and track your progress as you prepare for exams.
            </p>
            <div className="mt-8">
              <Button
                size="lg"
                className="text-lg px-8 py-6 h-auto bg-orange-500 hover:bg-orange-600 text-white"
                asChild
              >
                <Link href={getStartedHref}>
                  Start Studying Now
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
              Why Students Love Slide2Quiz
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
              Everything you need to ace your exams and master your courses
            </p>
          </div>
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-lg border border-gray-200 dark:border-gray-800 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-orange-100 dark:bg-orange-900/30 mb-6">
                <Clock className="h-7 w-7 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                Study in Minutes, Not Hours
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                No more spending hours creating study guides. Upload your lecture slides and get 
                instant practice quizzes that help you review and retain information efficiently.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-lg border border-gray-200 dark:border-gray-800 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-orange-100 dark:bg-orange-900/30 mb-6">
                <Sparkles className="h-7 w-7 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                Smart Questions That Test Understanding
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                Our AI creates questions that test your comprehension, not just memorization. 
                Practice with questions that mirror real exam scenarios and truly measure your knowledge.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-lg border border-gray-200 dark:border-gray-800 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-orange-100 dark:bg-orange-900/30 mb-6">
                <CheckCircle2 className="h-7 w-7 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                Instant Feedback & Progress Tracking
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                Get immediate feedback on every answer. Learn from mistakes in real-time and track 
                your progress to identify areas that need more practice before your exams.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Trusted by Students Worldwide
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Join thousands of students improving their grades and study habits
            </p>
          </div>
          
          {/* Stats Placeholder */}
          <div className="grid sm:grid-cols-3 gap-8 mb-16">
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-bold text-orange-500 mb-2">10K+</div>
              <div className="text-gray-600 dark:text-gray-300">Quizzes Taken</div>
            </div>
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-bold text-orange-500 mb-2">5K+</div>
              <div className="text-gray-600 dark:text-gray-300">Active Students</div>
            </div>
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-bold text-orange-500 mb-2">50K+</div>
              <div className="text-gray-600 dark:text-gray-300">Questions Answered</div>
            </div>
          </div>

          {/* Testimonials Placeholder */}
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-orange-500 text-orange-500" />
                ))}
              </div>
              <p className="text-gray-700 dark:text-gray-300 mb-4 italic">
                "Slide2Quiz helped me ace my midterms! The practice quizzes are so helpful for reviewing material. I went from a C+ to an A- this semester."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">Alex Martinez</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Computer Science Student</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-orange-500 text-orange-500" />
                ))}
              </div>
              <p className="text-gray-700 dark:text-gray-300 mb-4 italic">
                "The instant feedback is amazing. I can immediately see what I got wrong and why. It's like having a tutor available 24/7."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">Jordan Kim</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Biology Major</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-orange-500 text-orange-500" />
                ))}
              </div>
              <p className="text-gray-700 dark:text-gray-300 mb-4 italic">
                "I love how I can upload my lecture slides and get practice questions right away. It's made studying so much more efficient and effective."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">Sam Taylor</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Business Student</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-gradient-to-r from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Ace Your Next Exam?
          </h2>
          <p className="text-xl text-orange-50 mb-10 leading-relaxed">
            Join thousands of students who are improving their grades and study habits. 
            Start creating practice quizzes from your lecture slides today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="text-lg px-10 py-6 h-auto bg-white text-orange-600 hover:bg-gray-100 shadow-xl"
              asChild
            >
              <Link href={getStartedHref}>
                {getStartedText}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-10 py-6 h-auto bg-transparent border-2 border-white text-white hover:bg-white/10"
              asChild
            >
              <Link href="/pricing">
                View Pricing
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
