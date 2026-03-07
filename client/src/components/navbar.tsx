import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  UserPlus,
  Receipt,
  Pill,
  Stethoscope,
  Wallet,
  BarChart3,
  Moon,
  Sun,
  Heart,
  Calendar,
  Database,
  ChevronDown,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/registration", label: "New Registration", icon: UserPlus },
  { path: "/appointments", label: "Appointments", icon: Calendar },
  { path: "/billing", label: "Create Bill", icon: Receipt },
  { path: "/bills", label: "View Bills", icon: Receipt },
  { path: "/expenses", label: "Expenses", icon: Wallet },
  {
    label: "Masters",
    icon: Database,
    children: [
      { path: "/medicines", label: "Medicine Master", icon: Pill },
      { path: "/treatments", label: "Treatment Master", icon: Stethoscope },
    ]
  },
  { path: "/reports", label: "Reports", icon: BarChart3 },
];

function NavDropdown({ item, isActive }: { item: any, isActive: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const Icon = item.icon;

  return (
    <div
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={isActive ? "default" : "ghost"}
            size="sm"
            className="gap-2 shrink-0"
            data-testid="nav-masters"
          >
            <Icon className="w-4 h-4" />
            <span className="hidden lg:inline-block">{item.label}</span>
            <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {item.children.map((child: any) => {
            const ChildIcon = child.icon;
            return (
              <Link key={child.path} href={child.path}>
                <DropdownMenuItem className="cursor-pointer gap-2">
                  <ChildIcon className="w-4 h-4" />
                  {child.label}
                </DropdownMenuItem>
              </Link>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function Navbar() {
  const [location, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { user, logoutMutation } = useAuth();

  if (!user) return null;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setLocation("/auth");
      }
    });
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="max-w-[1600px] mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary">
              <Heart className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight hidden sm:inline-block" data-testid="text-clinic-name">
              Omera
            </span>
          </Link>

          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {navItems.filter(item => {
              const userRole = user?.role?.toLowerCase();
              if (userRole === 'receptionist') {
                return ['Dashboard', 'New Registration', 'Appointments', 'Manage Appointments'].includes(item.label);
              }
              return true;
            }).map((item, index) => {
              if (item.children) {
                const isActive = item.children.some(child => child.path === location);
                return <NavDropdown key={index} item={item} isActive={isActive} />;
              }

              const isActive = location === item.path;
              const Icon = item.icon;
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className="gap-2 shrink-0"
                    data-testid={`nav-${item.path.replace("/", "") || "dashboard"}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden lg:inline-block">{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
