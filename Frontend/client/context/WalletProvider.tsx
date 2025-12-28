import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo } from 'react';
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
    signTransaction,
    signAllTransactions,
    wallets // ← Add this - gives you all available wallets
  } = useSolanaWallet();

  const { connection } = useConnection();
  const [rpcUrl, setRpcUrl] = useState("");
  const { setVisible } = useWalletModal();

  // Check if ANY wallet is installed
  const hasAnyWallet = useMemo(() => {
    return wallets.some(w => w.readyState === 'Installed');
  }, [wallets]);

  const walletAddress = useMemo(() => {
    if (!publicKey) return null;
    const address = publicKey.toBase58();
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }, [publicKey]);

  const connectWallet = () => {
    setVisible(true);
  };

  const disconnectWallet = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  };

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

// Main provider component that wraps everything
export function WalletProvider({ children }: { children: ReactNode }) {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  // Configure supported wallets
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

// Custom hook to use the wallet context
export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}