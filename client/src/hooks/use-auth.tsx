import { createContext, ReactNode, useContext } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { insertAppointmentSchema, User, LoginInput, loginSchema, registerSchema, RegisterInput } from "@shared/schema";
import { apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
    user: User | null;
    isLoading: boolean;
    error: Error | null;
    loginMutation: any;
    logoutMutation: any;
    registerMutation: any;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const { toast } = useToast();
    const {
        data: user,
        error,
        isLoading,
    } = useQuery<User | undefined, Error>({
        queryKey: ["/api/user"],
        retry: false,
    });

    // useEffect(() => { if (user) console.log("AUTH PROVIDER USER:", user); }, [user]);

    const getErrorMessage = (error: Error) => {
        try {
            // Try to parse JSON from the error message (format: "Status: JSON")
            const parts = error.message.split(": ");
            if (parts.length > 1) {
                // Join back in case the JSON itself had ": "
                const jsonStr = parts.slice(1).join(": ");
                const data = JSON.parse(jsonStr);
                return data.message || error.message;
            }
        } catch {
            // If parsing fails, use the original message
        }
        return error.message;
    };

    const loginMutation = useMutation({
        mutationFn: async (credentials: LoginInput) => {
            const res = await apiRequest("POST", "/api/login", credentials);
            return await res.json();
        },
        onSuccess: (data: { user: User }) => {
            queryClient.setQueryData(["/api/user"], data.user);
        },
        onError: (error: Error) => {
            const message = getErrorMessage(error);
            // console.error("Login failed:", error); // Removed for security
            toast({
                title: "Login failed",
                description: message,
                variant: "destructive",
            });
        },
    });

    const registerMutation = useMutation({
        mutationFn: async (credentials: RegisterInput) => {
            const res = await apiRequest("POST", "/api/register", credentials);
            return await res.json();
        },
        onSuccess: (user: User) => {
            queryClient.setQueryData(["/api/user"], user);
        },
        onError: (error: Error) => {
            const message = getErrorMessage(error);
            console.error("Registration failed:", error);
            toast({
                title: "Registration failed",
                description: message,
                variant: "destructive",
            });
        },
    });

    const logoutMutation = useMutation({
        mutationFn: async () => {
            await apiRequest("POST", "/api/logout");
        },
        onSuccess: () => {
            queryClient.setQueryData(["/api/user"], null);
        },
        onError: (error: Error) => {
            const message = getErrorMessage(error);
            console.error("Logout failed:", error);
            toast({
                title: "Logout failed",
                description: message,
                variant: "destructive",
            });
        },
    });

    return (
        <AuthContext.Provider
            value={{
                user: user ?? null,
                isLoading,
                error,
                loginMutation,
                logoutMutation,
                registerMutation,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
