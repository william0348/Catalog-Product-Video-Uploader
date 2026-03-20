
import React, { useContext } from 'react';
import { LanguageContext } from '@/contexts/LanguageContext';

export const LanguageSwitcher = () => {
    const { language, setLanguage, t } = useContext(LanguageContext);
    return (
        <div className="language-switcher-container">
            <label htmlFor="language-select" className="sr-only">{t('language')}:</label>
            <select id="language-select" value={language} onChange={e => setLanguage(e.target.value)}>
                <option value="en">English</option>
                <option value="zh-TW">繁體中文</option>
            </select>
        </div>
    );
};
