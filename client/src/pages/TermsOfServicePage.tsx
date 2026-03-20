
import React, { useContext } from 'react';
import { AppFooter } from '@/components/AppFooter';
import { LanguageContext } from '@/contexts/LanguageContext';

export const TermsOfServicePage = () => {
    const { t } = useContext(LanguageContext);
    return (
        <main className="container data-view" style={{maxWidth: '800px'}}>
          <div className="card static-page-card">
            <header><h1>{t('termsOfService')}</h1></header>
            <p><strong>Last Updated:</strong> August 1, 2024</p>
            <p>Please read these Terms of Service ("Terms", "Terms of Service") carefully before using the "CPAS Catalog Video Uploader" application (the "Service") operated by us.</p>
            <p>Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms. These Terms apply to all visitors, users, and others who access or use the Service.</p>
            
            <h2>1. Accounts & Use of Service</h2>
            <p>When you use our Service, you are required to authenticate using your Google Account. You are responsible for safeguarding the credentials that you use to access the Service and for any activities or actions under your account. The Service is a client-side tool and does not store your passwords.</p>
            <p>You agree not to use the Service for any purpose that is illegal or prohibited by these Terms.</p>
    
            <h2>2. Intellectual Property</h2>
            <p>The Service and its original content, features, and functionality are and will remain the exclusive property of its creators. The content you upload (e.g., videos) remains your property.</p>
            <p>By uploading content, you grant the Service the necessary permissions to store the file in your Google Drive and record its metadata in your designated Google Sheet, as described in our Privacy Policy.</p>
    
            <h2>3. Links To Other Web Sites</h2>
            <p>Our Service may contain links to third-party web sites or services that are not owned or controlled by us, such as Google and Facebook. We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party web sites or services. You further acknowledge and agree that we shall not be responsible or liable, directly or indirectly, for any damage or loss caused or alleged to be caused by or in in connection with use of or reliance on any such content, goods or services available on or through any such web sites or services.</p>
    
            <h2>4. Termination</h2>
            <p>We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>
            <p>All provisions of the Terms which by their nature should survive termination shall survive termination, including, without limitation, ownership provisions, warranty disclaimers, indemnity and limitations of liability.</p>
    
            <h2>5. Disclaimer</h2>
            <p>Your use of the Service is at your sole risk. The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied, including, but not to, implied warranties of merchantability, fitness for a particular purpose, non-infringement or course of performance.</p>
    
            <h2>6. Governing Law</h2>
            <p>These Terms shall be governed and construed in accordance with the laws of the jurisdiction in which the Service is provided, without regard to its conflict of law provisions.</p>
    
            <h2>7. Changes</h2>
            <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material we will try to provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.</p>
            
            <h2>8. Contact Us</h2>
            <p>If you have any questions about these Terms, please contact us at [william03480348@gmail.com].</p>
            
            <AppFooter />
          </div>
        </main>
    );
}
