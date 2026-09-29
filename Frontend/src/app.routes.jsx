import { createBrowserRouter } from "react-router";
import Login from "./features/auth/pages/Login";
import Register from "./features/auth/pages/Register";
import Profile from "./features/account/pages/Profile";
import Feedback from "./features/account/pages/Feedback";
import Protected from "./features/auth/components/Protected";
import AdminOnly from "./features/auth/components/AdminOnly";
import Landing from "./features/marketing/pages/Landing";
import Dashboard from "./features/interview/pages/Dashboard";
import NewPlan from "./features/interview/pages/NewPlan";
import Interview from "./features/interview/pages/Interview";
import MockInterview from "./features/interview/pages/MockInterview";
import MockInterviewReport from "./features/interview/pages/MockInterviewReport";
import AdminPanel from "./features/admin/pages/AdminPanel";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <Landing />,
    },
    {
        path: "/login",
        element: <Login />,
    },
    {
        path: "/register",
        element: <Register />,
    },
    {
        path: "/account/profile",
        element: <Protected><Profile /></Protected>,
    },
    {
        path: "/account/feedback",
        element: <Protected><Feedback /></Protected>,
    },
    {
        path: "/admin",
        element: <Protected><AdminOnly><AdminPanel /></AdminOnly></Protected>,
    },
    {
        path: "/app",
        element: <Protected><Dashboard /></Protected>,
    },
    {
        path: "/app/new",
        element: <Protected><NewPlan /></Protected>,
    },
    {
        path: "/interview/:interviewId",
        element: <Protected><Interview /></Protected>,
    },
    {
        path: "/interview/:interviewId/mock",
        element: <Protected><MockInterview /></Protected>,
    },
    {
        path: "/interview/:interviewId/mock/:mockId",
        element: <Protected><MockInterview /></Protected>,
    },
    {
        path: "/interview/:interviewId/mock/:mockId/report",
        element: <Protected><MockInterviewReport /></Protected>,
    },
])
