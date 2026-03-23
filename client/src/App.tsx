import { useState, useEffect, useContext } from "react";
import { LanguageProvider, LanguageContext } from "@/contexts/LanguageContext";
import { AdminPanel } from "@/pages/AdminPanel";
import { TermsOfServicePage } from "@/pages/TermsOfServicePage";
import { MainApp } from "@/pages/MainApp";
import { SlideshowGenerator } from "@/pages/SlideshowGenerator";

const PageRouter = () => {
    const { t } = useContext(LanguageContext);
    const [hash, setHash] = useState(window.location.hash.toLowerCase() || '#/');
    
    useEffect(() => {
        const handleHashChange = () => {
            setHash(window.location.hash.toLowerCase() || '#/');
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);
    
    useEffect(() => {
        let title = 'CPAS Video Uploader';
        switch (hash) {
            case '#/admin':
                title = `${t('adminPanel')} - CPAS Video Uploader`;
                break;
            case '#/terms':
                title = `${t('termsOfService')} - CPAS Video Uploader`;
                break;
            case '#/slideshow':
                title = `${t('slideshowTitle') || 'Slideshow Generator'} - CPAS Video Uploader`;
                break;
        }
        document.title = title;
    }, [hash, t]);
    
    switch (hash) {
        case '#/admin':
            return <AdminPanel onBack={() => { window.location.hash = '#/'; }} />;
        case '#/terms':
            return <TermsOfServicePage />;
        case '#/slideshow':
            return <SlideshowGenerator key="slideshow" />;
        case '#/':
        default:
            return <MainApp />;
    }
};

function App() {
    return (
        <LanguageProvider>
            <PageRouter />
        </LanguageProvider>
    );
}

export default App;
export { App };
