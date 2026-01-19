import React from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { Layout } from "@/components/Layout";
import AnchorMode from "@/pages/AnchorMode";
import InstructionBuilder from "@/pages/InstructionBuilder";
import Simulator from "@/pages/Simulator";
import NotFound from "@/pages/not-found";
import WelcomeModal from "@/components/WelcomeModal";
import { WalletProvider } from "../../client/context/WalletProvider";

function Router() {
  return (
    <Layout>
      <Switch>
        
        <Route path="/" component={AnchorMode} />
        <Route path="/builder" component={InstructionBuilder} />
        <Route path="/simulator" component={Simulator} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
      <WelcomeModal />
      <Router />
      <Toaster />
      </WalletProvider>
    </QueryClientProvider>
  );
}

export default App;
