
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
                <a href="https://business.facebook.com/business-support-home/contact-support?source=business_help_center_support" target="_blank" rel="noopener noreferrer">{t('metaSupport')}</a>&nbsp;|&nbsp;
                {t('poweredBy')}
            </div>
            <div className="footer-logos">
                <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663317876169/nN7fRv522pr6qmVvUdeAQB/lion_logo_60bbcf52.png" alt="Power by Lion logo" className="footer-logo" />
                <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663317876169/nN7fRv522pr6qmVvUdeAQB/meta_logo_fe5db13a.png" alt="Meta logo" className="footer-logo meta-logo" />
            </div>
        </footer>
    );
};
