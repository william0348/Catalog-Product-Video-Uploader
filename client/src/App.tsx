import { useState, useEffect, useContext, useCallback } from "react";
import { LanguageProvider, LanguageContext } from "@/contexts/LanguageContext";
import { GoogleAuthProvider, useGoogleAuth } from "@/contexts/GoogleAuthContext";
import { AppLayout } from "@/components/AppLayout";
import { AdminPanel } from "@/pages/AdminPanel";
import { TermsOfServicePage } from "@/pages/TermsOfServicePage";
import { MainApp } from "@/pages/MainApp";
import { SlideshowGenerator } from "@/pages/SlideshowGenerator";

// Map hash routes to page IDs
const hashToPage = (hash: string): string => {
    switch (hash.toLowerCase()) {
        case '#/admin': return 'admin';
        case '#/terms': return 'terms';
        case '#/slideshow': return 'slideshow';
        case '#/':
        default: return 'main';
    }
};

const pageToHash = (page: string): string => {
    switch (page) {
        case 'admin': return '#/admin';
        case 'terms': return '#/terms';
        case 'slideshow': return '#/slideshow';
        case 'main':
        default: return '#/';
    }
};

const PageRouter = () => {
    const { t } = useContext(LanguageContext);
    const { userEmail, isGoogleReady, handleGoogleLogin, handleLogout } = useGoogleAuth();
    const [currentPage, setCurrentPage] = useState(() => hashToPage(window.location.hash || '#/'));
    
    useEffect(() => {
        const handleHashChange = () => {
            setCurrentPage(hashToPage(window.location.hash || '#/'));
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);
    
    useEffect(() => {
        let title = 'CPAS Video Uploader';
        switch (currentPage) {
            case 'admin':
                title = `${t('adminPanel')} - CPAS Video Uploader`;
                break;
            case 'terms':
                title = `${t('termsOfService')} - CPAS Video Uploader`;
                break;
            case 'slideshow':
                title = `${t('slideshowTitle') || 'Slideshow Generator'} - CPAS Video Uploader`;
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
            case 'main':
            default:
                return <MainApp />;
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
