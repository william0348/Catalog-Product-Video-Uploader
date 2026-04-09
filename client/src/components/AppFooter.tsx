
import React, { useContext } from 'react';
import { LanguageContext } from '@/contexts/LanguageContext';

export const AppFooter = () => {
    const { t } = useContext(LanguageContext);
    return (
        <footer className="page-footer">
            <div className="footer-links">
                <a href="#/home">{t('home')}</a> &nbsp;|&nbsp;
                <a href="https://www.williamlion.tw/privacy-policy/" target="_blank" rel="noopener noreferrer">{t('privacyPolicy')}</a> &nbsp;|&nbsp;
                <a href="#/terms">{t('termsOfService')}</a> &nbsp;|&nbsp;
                <a href="#/admin">{t('adminPanel')}</a> &nbsp;|&nbsp;
                {t('poweredBy')}
            </div>
        </footer>
    );
};
