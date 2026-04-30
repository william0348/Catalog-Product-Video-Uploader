import { useState, useEffect, useContext, useCallback } from "react";
import { LanguageProvider, LanguageContext } from "@/contexts/LanguageContext";
import { GoogleAuthProvider, useGoogleAuth } from "@/contexts/GoogleAuthContext";
import { AppLayout } from "@/components/AppLayout";
import { AdminPanel } from "@/pages/AdminPanel";
import { TermsOfServicePage } from "@/pages/TermsOfServicePage";
import { MainApp } from "@/pages/MainApp";
import { SlideshowGenerator } from "@/pages/SlideshowGenerator";
import { ReelsGenerator } from "@/pages/ReelsGenerator";

// Map hash routes to page IDs
const hashToPage = (hash: string): string => {
    switch (hash.toLowerCase()) {
        case '#/admin': return 'admin';
        case '#/terms': return 'terms';
        case '#/slideshow': return 'slideshow';
        case '#/reels': return 'reels';
        case '#/':
        default: return 'main';
    }
};

const pageToHash = (page: string): string => {
    switch (page) {
        case 'admin': return '#/admin';
        case 'terms': return '#/terms';
        case 'slideshow': return '#/slideshow';
        case 'reels': return '#/reels';
        case 'main':
        default: return '#/';
    }
};

const PageRouter = () => {
    const { t } = useContext(LanguageContext);
    const { userEmail, isGoogleReady, handleGoogleLogin, handleLogout } = useGoogleAuth();
    const [currentPage, setCurrentPage] = useState(() => hashToPage(window.location.hash || '#/'));
    const [aiVideoEnabled, setAiVideoEnabled] = useState(false);
    const [hasPrismKey, setHasPrismKey] = useState(false);
    
    useEffect(() => {
        const handleHashChange = () => {
            setCurrentPage(hashToPage(window.location.hash || '#/'));
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);
    
    useEffect(() => {
        let title = 'Reels & Catalog Tool';
        switch (currentPage) {
            case 'admin':
                title = `${t('adminPanel')} - Reels & Catalog Tool`;
                break;
            case 'terms':
                title = `${t('termsOfService')} - Reels & Catalog Tool`;
                break;
            case 'slideshow':
                title = `${t('slideshowTitle') || 'Slideshow Generator'} - Reels & Catalog Tool`;
                break;
        }
        document.title = title;
    }, [currentPage, t]);

    const handleNavigate = useCallback((page: string) => {
        window.location.hash = pageToHash(page);
    }, []);

    const renderPage = () => {
        switch (currentPage) {
            case 'admin':
                return <AdminPanel onBack={() => handleNavigate('main')} />;
            case 'terms':
                return <TermsOfServicePage />;
            case 'slideshow':
                return <SlideshowGenerator key="slideshow" />;
            case 'reels':
                return <ReelsGenerator />;
            case 'main':
            default:
                return <MainApp aiVideoEnabled={aiVideoEnabled} onPrismKeyStatus={setHasPrismKey} />;
        }
    };
    
    return (
        <AppLayout
            currentPage={currentPage}
            onNavigate={handleNavigate}
            userEmail={userEmail}
            onGoogleLogin={handleGoogleLogin}
            onLogout={handleLogout}
            isGoogleReady={isGoogleReady}
            aiVideoEnabled={aiVideoEnabled}
            onToggleAiVideo={hasPrismKey ? setAiVideoEnabled : undefined}
            fullWidthContent={currentPage === 'main'}
        >
            {renderPage()}
        </AppLayout>
    );
};

function App() {
    return (
        <LanguageProvider>
            <GoogleAuthProvider>
                <PageRouter />
            </GoogleAuthProvider>
        </LanguageProvider>
    );
}

export default App;
export { App };
