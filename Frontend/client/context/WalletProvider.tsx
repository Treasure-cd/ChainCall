import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo, useRef, useCallback } from 'react';
import { 
  ConnectionProvider, 
  WalletProvider as SolanaWalletProvider,
  useWallet as useSolanaWallet,
  useConnection
} from '@solana/wallet-adapter-react';
import { WalletModalProvider, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { 
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletContextType {
  isConnected: boolean;
  walletAddress: string | null;
  connectWallet: () => void;
  disconnectWallet: () => void;
  isLoading: boolean;
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
  signTransaction: (transaction: any) => Promise<any>;
  signAllTransactions: (transactions: any[]) => Promise<any[]>;
  hasAnyWallet: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function WalletContextProvider({ children }: { children: ReactNode }) {
  const { 
    publicKey, 
    wallet,
    connected, 
    connecting,
    disconnect,
    connect,
    select, 
    signTransaction,
    signAllTransactions,
    wallets
  } = useSolanaWallet();

  const { connection } = useConnection();
  const [rpcUrl, setRpcUrl] = useState("");
  const { setVisible } = useWalletModal();

  const isMounted = useRef(false);
  const isConnectingRef = useRef(false); 


  useEffect(() => {
    if (!isMounted.current) {
      if (!connected && wallet) {
        console.log('🧹 Clearing persisted wallet to prevent auto-connect');
        select(null);
      }
      isMounted.current = true;
    }
  }, [connected, wallet, select]);

  //Connection logic
  useEffect(() => {

    if (wallet && !connected && !connecting && isMounted.current) {
      
      const readyState = wallet.adapter.readyState;
      
      if (readyState === 'NotDetected' || readyState === 'Unsupported') {
        console.log(`🚫 Wallet (${wallet.adapter.name}) not installed. Redirecting...`);
        const url = wallet.adapter.url;
        if (url) {
          window.open(url, '_blank');
        }

        select(null);
        return;
      }

      if (readyState === 'Installed' || readyState === 'Loadable') {
        
        if (isConnectingRef.current) return;
        
        const timer = setTimeout(() => {
          isConnectingRef.current = true;
          console.log(`🔗 Wallet (${wallet.adapter.name}) ready. Connecting...`);
          
          connect()
            .catch((error) => {
              console.error('❌ Connection failed:', error);
            })
            .finally(() => {
              isConnectingRef.current = false;
            });
        }, 100);

        return () => clearTimeout(timer);
      }
    }
  }, [
    wallet, 
    connected, 
    connecting, 
    connect,
    select,
    wallet?.adapter?.readyState 
  ]);

  const hasAnyWallet = useMemo(() => {
    return wallets.some(w => w.readyState === 'Installed');
  }, [wallets]);


  const walletAddress = useMemo(() => {
    if (!publicKey) return null;
    const address = publicKey.toBase58();
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }, [publicKey]);

  const connectWallet = useCallback(() => {
    console.log('📱 Opening wallet modal...');
    setVisible(true);
  }, [setVisible]);

  const disconnectWallet = useCallback(async () => {
    try {
      console.log('🔌 Disconnecting wallet...');
      await disconnect();

      select(null);
    } catch (error) {
      console.error('❌ Disconnect error:', error);
    }
  }, [disconnect, select]);

  const value: WalletContextType = {
    isConnected: connected,
    walletAddress,
    connectWallet,
    disconnectWallet,
    isLoading: connecting,
    rpcUrl,
    setRpcUrl,
    signTransaction: signTransaction!,
    signAllTransactions: signAllTransactions!,
    hasAnyWallet,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}


export function WalletProvider({ children }: { children: ReactNode }) {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>

      <SolanaWalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <WalletContextProvider>{children}</WalletContextProvider>
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}