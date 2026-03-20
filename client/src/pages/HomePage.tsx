
import React, { useContext } from 'react';
import { AppFooter } from '@/components/AppFooter';
import { LanguageContext } from '@/contexts/LanguageContext';

export const HomePage = () => {
    const { t } = useContext(LanguageContext);
    return (
        <main className="container">
            <div className="card">
                <header className="home-header">
                    <h1>{t('homeHeader')}</h1>
                    <p>{t('homeSubheader')}</p>
                </header>

                <div className="static-page-card" style={{padding:0, boxShadow:'none', textAlign: 'left'}}>
                    <h3>{t('coreFeatures')}</h3>
                    <ul>
                        <li><strong>{t('featureFetch').split(': ')[0]}:</strong> {t('featureFetch').split(': ')[1]}</li>
                        <li><strong>{t('featureUpload').split(': ')[0]}:</strong> {t('featureUpload').split(': ')[1]}</li>
                        <li><strong>{t('featureDrive').split(': ')[0]}:</strong> {t('featureDrive').split(': ')[1]}</li>
                        <li><strong>{t('featureSheets').split(': ')[0]}:</strong> {t('featureSheets').split(': ')[1]}</li>
                        <li>{t('reviewPolicy')} <a href="https://www.williamlion.tw/privacy-policy/" target="_blank" rel="noopener noreferrer">{t('privacyPolicy')}</a> {t('and')} <a href="#/terms">{t('termsOfService')}</a>.</li>
                    </ul>
                </div>
                
                <a href="#/app" className="button-like-link">{t('getStarted')}</a>

                <AppFooter />
            </div>
        </main>
    );
};
