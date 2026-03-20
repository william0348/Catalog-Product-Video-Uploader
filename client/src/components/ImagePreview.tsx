
import React from 'react';
import type { HoveredImage } from '@/types';

export const ImagePreview = ({ image }: { image: HoveredImage | null }) => {
    if (!image) return null;
    return (
        <div className="image-preview" style={{ left: `${image.x + 15}px`, top: `${image.y + 15}px` }}>
            <img src={image.src} alt="Enlarged product" />
        </div>
    );
};
