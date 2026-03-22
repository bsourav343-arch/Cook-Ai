import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  ChefHat, 
  History, 
  Bookmark, 
  User as UserIcon, 
  LogOut, 
  Loader2, 
  ArrowLeft, 
  Check, 
  Clock, 
  ChevronRight,
  Heart,
  Share2,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db, handleFirestoreError } from './firebase';
import { useAuth } from './hooks/useAuth';
import { analyzeImageAndGenerateRecipes, AnalysisResult } from './services/geminiService';
import { Recipe, HistoryItem, OperationType, UserProfile } from './types';
import { cn, formatDate } from './lib/utils';
import { ErrorBoundary } from './components/ErrorBoundary';

type Screen = 'home' | 'result' | 'history' | 'saved' | 'profile' | 'paywall' | 'auth';

export default function App() {
  return (
    <ErrorBoundary>
      <CookAIApp />
    </ErrorBoundary>
  );
}

function CookAIApp() {
  const { user, profile, loading: authLoading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);

  // Navigation guard
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        setCurrentScreen('auth');
      } else if (profile && profile.subscriptionStatus === 'free' && currentScreen !== 'profile') {
        setCurrentScreen('paywall');
      }
    }
  }, [user, profile, authLoading]);

  // Fetch history and saved recipes
  useEffect(() => {
    if (user) {
      const historyQuery = query(
        collection(db, 'users', user.uid, 'history'),
        orderBy('createdAt', 'desc')
      );
      const unsubHistory = onSnapshot(historyQuery, (snap) => {
        setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as HistoryItem)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/history`));

      const savedQuery = query(
        collection(db, 'users', user.uid, 'recipes'),
        orderBy('createdAt', 'desc')
      );
      const unsubSaved = onSnapshot(savedQuery, (snap) => {
        setSavedRecipes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipe)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/recipes`));

      return () => {
        unsubHistory();
        unsubSaved();
      };
    }
  }, [user]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setSelectedImage(base64);
      setAnalyzing(true);
      setCurrentScreen('result');

      try {
        const result = await analyzeImageAndGenerateRecipes(base64);
        setAnalysisResult(result);
        
        // Save to history
        if (user) {
          await addDoc(collection(db, 'users', user.uid, 'history'), {
            userId: user.uid,
            detectedIngredients: result.detectedIngredients,
            imageUrl: base64, // In a real app, we'd upload to Storage and save the URL
            createdAt: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error("Analysis failed:", error);
        alert("Failed to analyze image. Please try again.");
        setCurrentScreen('home');
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const saveRecipe = async (recipe: AnalysisResult['recipes'][0]) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'recipes'), {
        userId: user.uid,
        ...recipe,
        detectedIngredients: analysisResult?.detectedIngredients || [],
        createdAt: new Date().toISOString()
      });
      alert("Recipe saved!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/recipes`);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <Loader2 className="w-12 h-12 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto shadow-2xl relative overflow-hidden font-sans">
      {/* Header */}
      {currentScreen !== 'auth' && (
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="bg-green-600 p-1.5 rounded-lg">
              <ChefHat className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Cook AI</h1>
          </div>
          {user && (
            <button 
              onClick={() => setCurrentScreen('profile')}
              className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center overflow-hidden"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <UserIcon className="w-5 h-5 text-green-600" />
              )}
            </button>
          )}
        </header>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <AnimatePresence mode="wait">
          {currentScreen === 'auth' && <AuthScreen key="auth" />}
          {currentScreen === 'paywall' && <PaywallScreen key="paywall" />}
          {currentScreen === 'home' && (
            <HomeScreen 
              key="home" 
              onUpload={handleImageUpload} 
              history={history}
              onViewHistory={(item) => {
                setSelectedImage(item.imageUrl || null);
                setAnalysisResult({ detectedIngredients: item.detectedIngredients, recipes: [] });
                setCurrentScreen('result');
              }}
            />
          )}
          {currentScreen === 'result' && (
            <ResultScreen 
              key="result"
              image={selectedImage}
              analyzing={analyzing}
              result={analysisResult}
              onBack={() => setCurrentScreen('home')}
              onSave={saveRecipe}
            />
          )}
          {currentScreen === 'history' && (
            <HistoryScreen 
              key="history"
              history={history}
              onBack={() => setCurrentScreen('home')}
              onView={(item) => {
                setSelectedImage(item.imageUrl || null);
                setAnalysisResult({ detectedIngredients: item.detectedIngredients, recipes: [] });
                setCurrentScreen('result');
              }}
            />
          )}
          {currentScreen === 'saved' && (
            <SavedRecipesScreen 
              key="saved"
              recipes={savedRecipes}
              onBack={() => setCurrentScreen('home')}
            />
          )}
          {currentScreen === 'profile' && (
            <ProfileScreen 
              key="profile"
              user={user}
              profile={profile}
              onBack={() => setCurrentScreen('home')}
              onLogout={() => signOut(auth)}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      {currentScreen !== 'auth' && currentScreen !== 'paywall' && (
        <nav className="bg-white/80 backdrop-blur-md border-t border-gray-100 px-8 py-4 flex justify-between items-center fixed bottom-0 max-w-md w-full z-10">
          <NavButton 
            active={currentScreen === 'home'} 
            onClick={() => setCurrentScreen('home')} 
            icon={<Camera className="w-6 h-6" />} 
            label="Home" 
          />
          <NavButton 
            active={currentScreen === 'history'} 
            onClick={() => setCurrentScreen('history')} 
            icon={<History className="w-6 h-6" />} 
            label="History" 
          />
          <NavButton 
            active={currentScreen === 'saved'} 
            onClick={() => setCurrentScreen('saved')} 
            icon={<Bookmark className="w-6 h-6" />} 
            label="Saved" 
          />
          <NavButton 
            active={currentScreen === 'profile'} 
            onClick={() => setCurrentScreen('profile')} 
            icon={<UserIcon className="w-6 h-6" />} 
            label="Me" 
          />
        </nav>
      )}
    </div>
  );
}

// --- Components ---

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all duration-300",
        active ? "text-green-600 scale-110" : "text-gray-400 hover:text-gray-600"
      )}
    >
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen flex flex-col px-8 pt-20 bg-white"
    >
      <div className="mb-12 text-center">
        <div className="bg-green-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-200">
          <ChefHat className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Cook AI</h2>
        <p className="text-gray-500">Your personal AI sous-chef</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
            placeholder="hello@example.com"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
            placeholder="••••••••"
            required
          />
        </div>
        <button 
          disabled={loading}
          className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" /> : (isLogin ? 'Sign In' : 'Sign Up')}
        </button>
      </form>

      <div className="mt-6 flex items-center gap-4 text-gray-400">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-bold uppercase tracking-widest">OR</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <button 
        onClick={handleGoogleLogin}
        className="mt-6 w-full bg-white border border-gray-200 text-gray-700 py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-gray-50 transition-all"
      >
        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
        Continue with Google
      </button>

      <p className="mt-auto mb-8 text-center text-gray-600">
        {isLogin ? "Don't have an account?" : "Already have an account?"}
        <button 
          onClick={() => setIsLogin(!isLogin)}
          className="ml-2 text-green-600 font-bold hover:underline"
        >
          {isLogin ? 'Sign Up' : 'Sign In'}
        </button>
      </p>
    </motion.div>
  );
}

function PaywallScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    if (!user) return;
    setLoading(true);
    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const expiry = new Date();
      if (plan === 'monthly') expiry.setMonth(expiry.getMonth() + 1);
      else expiry.setFullYear(expiry.getFullYear() + 1);

      await updateDoc(doc(db, 'users', user.uid), {
        subscriptionStatus: plan,
        subscriptionExpiry: expiry.toISOString()
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-white px-6 pt-12 flex flex-col"
    >
      <div className="text-center mb-10">
        <div className="inline-block bg-orange-100 text-orange-600 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
          Premium Feature
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Unlock Unlimited Recipes</h2>
        <p className="text-gray-500 leading-relaxed">
          Get access to AI ingredient detection and personalized recipe generation.
        </p>
      </div>

      <div className="space-y-4 mb-12">
        <BenefitItem text="Unlimited AI Image Analysis" />
        <BenefitItem text="Personalized Recipe Suggestions" />
        <BenefitItem text="Save Unlimited Favorites" />
        <BenefitItem text="Ad-free Experience" />
      </div>

      <div className="space-y-4">
        <PlanCard 
          title="Monthly Plan" 
          price="$9.99" 
          period="/mo" 
          onClick={() => handleSubscribe('monthly')}
          loading={loading}
        />
        <PlanCard 
          title="Yearly Plan" 
          price="$79.99" 
          period="/yr" 
          highlight="Save 33%"
          onClick={() => handleSubscribe('yearly')}
          loading={loading}
        />
      </div>

      <p className="mt-8 text-center text-xs text-gray-400 px-8">
        By subscribing, you agree to our Terms of Service and Privacy Policy. Cancel anytime.
      </p>
    </motion.div>
  );
}

function BenefitItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="bg-green-100 p-1 rounded-full">
        <Check className="w-4 h-4 text-green-600" />
      </div>
      <span className="text-gray-700 font-medium">{text}</span>
    </div>
  );
}

function PlanCard({ title, price, period, highlight, onClick, loading }: { title: string, price: string, period: string, highlight?: string, onClick: () => void, loading: boolean }) {
  return (
    <button 
      onClick={onClick}
      disabled={loading}
      className={cn(
        "w-full p-6 rounded-2xl border-2 text-left transition-all relative group",
        highlight ? "border-green-600 bg-green-50/50" : "border-gray-100 hover:border-green-200"
      )}
    >
      {highlight && (
        <span className="absolute -top-3 right-6 bg-green-600 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
          {highlight}
        </span>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-gray-900">{price}</span>
            <span className="text-gray-500 text-sm">{period}</span>
          </div>
        </div>
        <div className="bg-white w-10 h-10 rounded-full flex items-center justify-center shadow-sm group-hover:bg-green-600 group-hover:text-white transition-colors">
          <ChevronRight className="w-6 h-6" />
        </div>
      </div>
    </button>
  );
}

function HomeScreen({ onUpload, history, onViewHistory }: { onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void, history: HistoryItem[], onViewHistory: (item: HistoryItem) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="px-6 pt-8"
    >
      <div className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">What's in your fridge?</h2>
        <p className="text-gray-500">Upload a photo of your ingredients and let AI suggest recipes.</p>
      </div>

      {/* Upload Area */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="bg-white border-2 border-dashed border-green-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-green-50/50 transition-all group mb-12"
      >
        <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
          <Camera className="w-10 h-10 text-green-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Snap or Upload Photo</h3>
        <p className="text-sm text-gray-400">Supports JPG, PNG up to 10MB</p>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={onUpload} 
          accept="image/*" 
          className="hidden" 
        />
      </div>

      {/* Recent Activity */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Recent Scans</h3>
            <button className="text-green-600 text-sm font-bold">See All</button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
            {history.slice(0, 5).map((item) => (
              <button 
                key={item.id}
                onClick={() => onViewHistory(item)}
                className="flex-shrink-0 w-32 group"
              >
                <div className="w-32 h-32 rounded-2xl overflow-hidden mb-2 bg-gray-200">
                  <img src={item.imageUrl} alt="Scan" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                </div>
                <p className="text-xs font-bold text-gray-900 truncate">{item.detectedIngredients.join(', ')}</p>
                <p className="text-[10px] text-gray-400">{formatDate(item.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ResultScreen({ image, analyzing, result, onBack, onSave }: { image: string | null, analyzing: boolean, result: AnalysisResult | null, onBack: () => void, onSave: (recipe: AnalysisResult['recipes'][0]) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col"
    >
      <div className="relative h-64 bg-gray-900">
        {image && <img src={image} alt="Uploaded" className="w-full h-full object-cover opacity-60" />}
        <button 
          onClick={onBack}
          className="absolute top-6 left-6 bg-white/20 backdrop-blur-md p-2 rounded-full text-white hover:bg-white/40 transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="absolute bottom-6 left-6 right-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            {analyzing ? 'Analyzing Ingredients...' : 'Analysis Complete'}
          </h2>
          {!analyzing && result && (
            <div className="flex flex-wrap gap-2">
              {result.detectedIngredients.map((ing, i) => (
                <span key={i} className="bg-white/20 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-medium">
                  {ing}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-8">
        {analyzing ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Loader2 className="w-12 h-12 text-green-600 animate-spin mb-6" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Cooking up ideas...</h3>
            <p className="text-gray-500">Our AI is finding the best recipes for your ingredients.</p>
          </div>
        ) : (
          <div className="space-y-8">
            <h3 className="text-xl font-bold text-gray-900">Suggested Recipes</h3>
            {result?.recipes.map((recipe, i) => (
              <RecipeCard key={i} recipe={recipe} onSave={() => onSave(recipe)} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function RecipeCard({ recipe, onSave }: { recipe: Partial<AnalysisResult['recipes'][0]> & { dishName: string, ingredients: string[], instructions: string[] }, onSave: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h4 className="text-lg font-bold text-gray-900 flex-1 pr-4">{recipe.dishName}</h4>
          <button 
            onClick={onSave}
            className="p-2 rounded-full bg-green-50 text-green-600 hover:bg-green-600 hover:text-white transition-all"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{recipe.cookingTime || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-1">
            <ChefHat className="w-4 h-4" />
            <span>{recipe.ingredients.length} ingredients</span>
          </div>
        </div>

        <button 
          onClick={() => setExpanded(!expanded)}
          className="w-full py-3 bg-gray-50 rounded-xl text-gray-900 font-bold text-sm hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
        >
          {expanded ? 'Hide Details' : 'View Recipe'}
          <ChevronRight className={cn("w-4 h-4 transition-transform", expanded && "rotate-90")} />
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-6 space-y-6">
                <div>
                  <h5 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-3">Ingredients</h5>
                  <ul className="grid grid-cols-1 gap-2">
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        {ing}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h5 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-3">Instructions</h5>
                  <ol className="space-y-4">
                    {recipe.instructions.map((step, i) => (
                      <li key={i} className="flex gap-4">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <p className="text-sm text-gray-600 leading-relaxed">{step}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function HistoryScreen({ history, onBack, onView }: { history: HistoryItem[], onBack: () => void, onView: (item: HistoryItem) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="px-6 pt-8"
    >
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 rounded-full bg-white border border-gray-100 shadow-sm">
          <ArrowLeft className="w-6 h-6 text-gray-900" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Scan History</h2>
      </div>

      <div className="space-y-4">
        {history.map((item) => (
          <button 
            key={item.id}
            onClick={() => onView(item)}
            className="w-full bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 hover:shadow-md transition-all text-left group"
          >
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
              <img src={item.imageUrl} alt="Scan" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate mb-1">
                {item.detectedIngredients.join(', ')}
              </p>
              <p className="text-xs text-gray-400 mb-2">{formatDate(item.createdAt)}</p>
              <div className="flex gap-1">
                {item.detectedIngredients.slice(0, 3).map((ing, i) => (
                  <span key={i} className="bg-gray-50 text-gray-500 px-2 py-0.5 rounded text-[10px] font-medium">
                    {ing}
                  </span>
                ))}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-green-600 transition-colors" />
          </button>
        ))}
        {history.length === 0 && (
          <div className="text-center py-20">
            <History className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400">No scans yet. Start by uploading a photo!</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SavedRecipesScreen({ recipes, onBack }: { recipes: Recipe[], onBack: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="px-6 pt-8"
    >
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 rounded-full bg-white border border-gray-100 shadow-sm">
          <ArrowLeft className="w-6 h-6 text-gray-900" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Saved Recipes</h2>
      </div>

      <div className="space-y-6">
        {recipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} onSave={() => {}} />
        ))}
        {recipes.length === 0 && (
          <div className="text-center py-20">
            <Bookmark className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400">No saved recipes yet. Explore and save some!</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ProfileScreen({ user, profile, onBack, onLogout }: { user: any, profile: UserProfile | null, onBack: () => void, onLogout: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="px-6 pt-8"
    >
      <div className="flex items-center gap-4 mb-10">
        <button onClick={onBack} className="p-2 rounded-full bg-white border border-gray-100 shadow-sm">
          <ArrowLeft className="w-6 h-6 text-gray-900" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Profile</h2>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-gray-100 text-center mb-8">
        <div className="w-24 h-24 rounded-full bg-green-100 mx-auto mb-6 flex items-center justify-center overflow-hidden border-4 border-white shadow-lg">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <UserIcon className="w-10 h-10 text-green-600" />
          )}
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-1">{profile?.displayName || user?.email?.split('@')[0]}</h3>
        <p className="text-gray-500 text-sm mb-6">{user?.email}</p>
        
        <div className="inline-flex items-center gap-2 bg-green-50 text-green-600 px-4 py-2 rounded-full text-sm font-bold">
          <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
          {profile?.subscriptionStatus === 'free' ? 'Free Plan' : `${profile?.subscriptionStatus.charAt(0).toUpperCase()}${profile?.subscriptionStatus.slice(1)} Member`}
        </div>
      </div>

      <div className="space-y-3">
        <ProfileLink icon={<UserIcon className="w-5 h-5" />} label="Edit Profile" />
        <ProfileLink icon={<History className="w-5 h-5" />} label="Billing History" />
        <ProfileLink icon={<Share2 className="w-5 h-5" />} label="Invite Friends" />
        <button 
          onClick={onLogout}
          className="w-full flex items-center justify-between p-5 rounded-2xl bg-red-50 text-red-600 font-bold hover:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-4">
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </div>
          <ChevronRight className="w-5 h-5 opacity-50" />
        </button>
      </div>
    </motion.div>
  );
}

function ProfileLink({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <button className="w-full flex items-center justify-between p-5 rounded-2xl bg-white border border-gray-50 hover:border-gray-200 transition-all group">
      <div className="flex items-center gap-4">
        <div className="text-gray-400 group-hover:text-green-600 transition-colors">{icon}</div>
        <span className="font-bold text-gray-700">{label}</span>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-green-600 transition-colors" />
    </button>
  );
}
