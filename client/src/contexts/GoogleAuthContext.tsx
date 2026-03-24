import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { GOOGLE_CLIENT_ID, GOOGLE_API_SCOPES, GOOGLE_AUTH_TOKEN_KEY } from "@/constants";

declare const gapi: any;
declare const window: any;

interface GoogleAuthContextType {
  googleAccessToken: string | null;
  userEmail: string | null;
  isGapiClientReady: boolean;
  isGoogleReady: boolean;
  googleTokenClient: any;
  handleGoogleLogin: () => void;
  handleLogout: () => void;
  setGoogleAccessToken: React.Dispatch<React.SetStateAction<string | null>>;
  setUserEmail: React.Dispatch<React.SetStateAction<string | null>>;
}

const GoogleAuthContext = createContext<GoogleAuthContextType>({
  googleAccessToken: null,
  userEmail: null,
  isGapiClientReady: false,
  isGoogleReady: false,
  googleTokenClient: null,
  handleGoogleLogin: () => {},
  handleLogout: () => {},
  setGoogleAccessToken: () => {},
  setUserEmail: () => {},
});

export const useGoogleAuth = () => useContext(GoogleAuthContext);

export const GoogleAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [googleTokenClient, setGoogleTokenClient] = useState<any>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isGapiClientReady, setIsGapiClientReady] = useState(false);

  // Initialize gapi client
  useEffect(() => {
    const checkGapi = () => {
      if (window.gapi) {
        gapi.load("client", () => {
          gapi.client
            .init({
              discoveryDocs: [
                "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
              ],
            })
            .then(() => setIsGapiClientReady(true))
            .catch((err: any) =>
              console.error("Failed to initialize Google APIs:", err.message)
            );
        });
      } else {
        setTimeout(checkGapi, 100);
      }
    };
    checkGapi();
  }, []);

  // Initialize Google Identity Services token client
  useEffect(() => {
    if (!isGapiClientReady) return;

    const checkGis = () => {
      if (window.google) {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: GOOGLE_API_SCOPES,
          callback: (tokenResponse: any) => {
            if (tokenResponse.error) {
              console.error(
                "Google login error:",
                tokenResponse.error_description || tokenResponse.error
              );
              setGoogleAccessToken(null);
              localStorage.removeItem(GOOGLE_AUTH_TOKEN_KEY);
              return;
            }
            const token = tokenResponse.access_token;
            setGoogleAccessToken(token);
            gapi.client.setToken({ access_token: token });
            localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, token);
          },
        });
        setGoogleTokenClient(tokenClient);
      } else {
        setTimeout(checkGis, 100);
      }
    };
    checkGis();
  }, [isGapiClientReady]);

  // Restore token from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY);
    if (storedToken && isGapiClientReady) {
      setGoogleAccessToken(storedToken);
      gapi.client.setToken({ access_token: storedToken });
    }
  }, [isGapiClientReady]);

  // Fetch user email when token is available
  useEffect(() => {
    if (googleAccessToken && isGapiClientReady) {
      fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      })
        .then((response) => {
          if (!response.ok) {
            if (response.status === 401) {
              handleLogout();
              throw new Error("Google session expired. Please log in again.");
            }
            throw new Error("Failed to fetch user info");
          }
          return response.json();
        })
        .then((data) => {
          if (data.email) {
            setUserEmail(data.email);
          } else {
            console.error("Email not found in userinfo response:", data);
          }
        })
        .catch((err: any) => {
          console.error("Error fetching user profile:", err);
        });
    }
  }, [googleAccessToken, isGapiClientReady]);

  const handleLogout = useCallback(() => {
    const token =
      googleAccessToken || localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY);
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => {
        console.log("[Google] Token revoked");
      });
    }
    localStorage.removeItem(GOOGLE_AUTH_TOKEN_KEY);
    sessionStorage.removeItem("google_drive_folder_id");
    if (window.gapi?.client) {
      gapi.client.setToken(null);
    }
    setGoogleAccessToken(null);
    setUserEmail(null);
  }, [googleAccessToken]);

  const handleGoogleLogin = useCallback(() => {
    if (googleTokenClient) {
      googleTokenClient.requestAccessToken();
    }
  }, [googleTokenClient]);

  const isGoogleReady = isGapiClientReady && !!googleTokenClient;

  return (
    <GoogleAuthContext.Provider
      value={{
        googleAccessToken,
        userEmail,
        isGapiClientReady,
        isGoogleReady,
        googleTokenClient,
        handleGoogleLogin,
        handleLogout,
        setGoogleAccessToken,
        setUserEmail,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
};
