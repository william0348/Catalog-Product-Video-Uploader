
import React, { useState, useMemo, useEffect, useContext } from "react";
import { LanguageContext } from '@/contexts/LanguageContext';

export const IntroGuide = ({ show, onComplete, targets }: { show: boolean, onComplete: () => void, targets: any }) => {
    const [step, setStep] = useState(0);
    const [highlightStyle, setHighlightStyle] = useState({});
    const [tooltipStyle, setTooltipStyle] = useState({});
    const { t } = useContext(LanguageContext);

    const steps = useMemo(() => [
        {
            title: t('introWelcomeTitle'),
            text: t('introWelcomeText'),
            target: null, // No specific element for the welcome message
        },
        {
            title: t('introSetTitle'),
            text: t('introSetText'),
            target: targets.productSetRef,
        },
        {
            title: t('introLoginTitle'),
            text: t('introLoginText'),
            target: targets.googleLoginRef,
        },
        {
            title: t('introReadyTitle'),
            text: t('introReadyText'),
            target: null,
        }
    ], [t, targets]);

    useEffect(() => {
        if (!show || !steps[step]) {
            setHighlightStyle({});
            setTooltipStyle({});
            return;
        }

        const targetNode = steps[step].target?.current;
        
        if (!targetNode) { // For welcome/end messages, center the tooltip
            setHighlightStyle({}); // No highlight
            setTooltipStyle({
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '300px'
            });
            return;
        }

        const targetRect = targetNode.getBoundingClientRect();
        const PADDING = 10; // 5px of padding on each side of the highlight

        setHighlightStyle({
            '--highlight-height': `${targetRect.height + PADDING}px`,
            '--highlight-width': `${targetRect.width + PADDING}px`,
            '--highlight-top': `${targetRect.top - (PADDING / 2)}px`,
            '--highlight-left': `${targetRect.left - (PADDING / 2)}px`,
        });
        
        setTooltipStyle({
            top: `${targetRect.bottom + 15}px`,
            left: `${targetRect.left + targetRect.width / 2}px`,
            transform: 'translateX(-50%)'
        });

    }, [step, show, steps]);


    const handleNext = () => {
        if (step < steps.length - 1) {
            setStep(step + 1);
        } else {
            onComplete();
        }
    };

    if (!show) return null;

    const currentStep = steps[step];
    const isLastStep = step === steps.length - 1;

    return (
        <div className={`intro-guide-overlay ${!currentStep.target ? 'solid-background' : ''}`}>
            {currentStep.target && <div className="intro-guide-highlight" style={highlightStyle}></div>}
            <div className={`intro-guide-tooltip ${!currentStep.target ? 'centered' : ''}`} style={tooltipStyle}>
                <h3>{currentStep.title}</h3>
                <p>{currentStep.text}</p>
                <div className="intro-guide-nav">
                    {step > 0 && <button onClick={onComplete} className="intro-guide-skip">{t('skip')}</button>}
                    <button onClick={handleNext} className="intro-guide-next">
                        {isLastStep ? t('finish') : t('next')}
                    </button>
                </div>
            </div>
        </div>
    );
};
