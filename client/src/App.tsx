import { Route, Switch } from "wouter";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Trades from "./pages/Trades";
import PnlCalendar from "./pages/PnlCalendar";
import Strategies from "./pages/Strategies";
import Knowledge from "./pages/Knowledge";
import Analyze from "./pages/Analyze";
import Finder from "./pages/Finder";
import Memory from "./pages/Memory";
import News from "./pages/News";
import Backtester from "./pages/Backtester";

export default function App() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/trades" component={Trades} />
        <Route path="/pnl" component={PnlCalendar} />
        <Route path="/strategies" component={Strategies} />
        <Route path="/ikb" component={Knowledge} />
        <Route path="/analyze" component={Analyze} />
        <Route path="/finder" component={Finder} />
        <Route path="/memory" component={Memory} />
        <Route path="/news" component={News} />
        <Route path="/backtest" component={Backtester} />
        <Route>
          <div className="flex items-center justify-center h-full text-gray-500">
            Page not found
          </div>
        </Route>
      </Switch>
    </Layout>
  );
}
