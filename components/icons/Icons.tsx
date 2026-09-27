// components/icons/Icons.tsx
import { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export const Icons = {
  // ============================================================
  // 1. ICÔNES POUR LA PAGE D'ACCUEIL
  // ============================================================

  Google: ({ size = 24, ...props }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  ),

  LogOut: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),

  ChevronDown: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),

  // ============================================================
  // 2. ICÔNES POUR LA PAGE À PROPOS
  // ============================================================

  Innovation: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.5 3.5 0 0 0 10.5 19h3" />
    </svg>
  ),

  Resourcefulness: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),

  Inspiration: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),

  Strategy: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),

  Professionalism: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),

  Engagement: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),

  Education: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="10" y1="8" x2="16" y2="8" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  ),

  Business: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),

  UserCircle: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),

  // ============================================================
  // 3. ICÔNES POUR LA PAGE CONTACT
  // ============================================================

  User: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),

  Mail: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),

  Phone: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),

  Message: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),

  // ============================================================
  // 4. ICÔNES POUR LA PAGE SERVICES
  // ============================================================

  Code: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),

  Globe: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),

  Megaphone: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M3 11l18-5v12L3 14v-3z" />
      <path d="M6 14v4a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-4" />
    </svg>
  ),

  Chart: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M21 12v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3" />
      <polyline points="15 6 21 6 21 12" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),

  Palette: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="13.5" cy="6.5" r="0.5" />
      <circle cx="17.5" cy="10.5" r="0.5" />
      <circle cx="8.5" cy="7.5" r="0.5" />
      <circle cx="6.5" cy="12.5" r="0.5" />
      <path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10a2 2 0 0 0 2-2c0-.52-.2-1-.53-1.37-.33-.37-.47-.85-.47-1.37 0-1.1.9-2 2-2h2.5c1.66 0 3-1.34 3-3 0-4.41-4.49-8-10-8z" />
    </svg>
  ),

  Share: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),

  Target: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),

  BarChart: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),

  Heart: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),

  Briefcase: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),

  // ============================================================
  // 5. ICÔNES SUPPLÉMENTAIRES
  // ============================================================

  Home: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6" />
    </svg>
  ),

  ChevronRight: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),

  ChevronLeft: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),

  Edit: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),

  Shield: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),

  Send: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),

  Check: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),

  Alert: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),

  Coin: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20" />
      <path d="M22 12H2" />
    </svg>
  ),

  Clock: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),

  Calendar: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),

  CreditCard: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),

  GraduationCap: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  ),

  // ============================================================
  // 6. NOUVELLES ICÔNES : DÉV. MOBILE ET CHATBOT
  // ============================================================

  Smartphone: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
      <path d="M9 7h6" />
      <path d="M9 11h4" />
    </svg>
  ),

  Chatbot: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <defs>
        {/* Masque pour percer les yeux et la bouche dans le bloc du visage */}
        <mask id="chatbot-solid-mask">
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle cx="9.5" cy="13" r="1.2" fill="black" stroke="none" />
          <circle cx="14.5" cy="13" r="1.2" fill="black" stroke="none" />
          <path d="M9.5 15.5c1 1 4 1 5 0" stroke="black" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </mask>
      </defs>

      {/* 1. L'antenne (Boule pleine et tige en trait) */}
      <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none" />
      <line x1="12" y1="4" x2="12" y2="9.5" />

      {/* 2. L'arceau du casque (Dessiné au centre exact des oreillettes) */}
      <path d="M5.5 11.5V10a6.5 6.5 0 0 1 13 0v1.5" />

      {/* 3. Les oreillettes pleines */}
      <rect x="3.5" y="11" width="3" height="4.5" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="17.5" y="11" width="3" height="4.5" rx="1.5" fill="currentColor" stroke="none" />

      {/* 4. Le corps du visage (Plein, avec l'application du masque) */}
      <rect 
        x="6" 
        y="9.5" 
        width="12" 
        height="8" 
        rx="2.5" 
        fill="currentColor" 
        stroke="none" 
        mask="url(#chatbot-solid-mask)" 
      />

      {/* 5. Le bras du micro */}
      <path d="M18.5 14v4a3 3 0 0 1-3 3h-3.5v-2" />
    </svg>
  ),

  // Icône pour le partenariat / sponsoring
  Handshake: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M17 11v5" />
      <path d="M7 11v5" />
      <path d="M3 9l4-4 4 4" />
      <path d="M21 9l-4-4-4 4" />
      <path d="M3 9v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9" />
      <path d="M7 9h10" />
    </svg>
  ),
  MapPin: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),

  FileText: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),

  Lock: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),

  FileCheck: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <polyline points="9 15 11 17 15 13" />
    </svg>
  ),

  Scale: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M3 3v18h18" />
      <path d="M7 7l10 10" />
      <path d="M7 17l10-10" />
    </svg>
  ),
  Info: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Eye: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  X: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  GitBranch: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  ),

  Crown: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M2 8l3 12h14l3-12-5 4-5-4-5 4-5-4z" />
      <path d="M2 8l3-4 5 2 5-2 5 4" />
    </svg>
  ),
  
  HelpCircle: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Search: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Business_dep: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <defs>
        {/* Le masque permet de créer l'espace transparent entre la flèche et les barres */}
        <mask id="studies-arrow-mask">
          {/* Tout ce qui est blanc sera visible */}
          <rect x="0" y="0" width="24" height="24" fill="white" />
          {/* Tout ce qui est noir sera rendu transparent (découpé) */}
          <path 
            d="M2 15L9 8L13 12L21 4" 
            stroke="black" 
            strokeWidth="6" 
            fill="none" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          <polygon 
            points="14 4 21 4 21 11" 
            fill="black" 
            stroke="black" 
            strokeWidth="6" 
            strokeLinejoin="round" 
          />
        </mask>
      </defs>

      {/* 1. Les 4 barres de l'histogramme (soumises au masque de découpe) */}
      <g mask="url(#studies-arrow-mask)" fill="currentColor" stroke="none">
        <rect x="3" y="13" width="3.5" height="9" rx="1" />
        <rect x="8.5" y="10" width="3.5" height="12" rx="1" />
        <rect x="14" y="7" width="3.5" height="15" rx="1" />
        <rect x="19.5" y="4" width="3.5" height="18" rx="1" />
      </g>

      {/* 2. La ligne brisée épaisse (la flèche) */}
      <path 
        d="M2 15L9 8L13 12L21 4" 
        stroke="currentColor" 
        strokeWidth="2" 
        fill="none" 
      />
      
      {/* 3. La pointe de la flèche (triangle plein) */}
      <polygon 
        points="15 4 21 4 21 10" 
        fill="currentColor" 
        stroke="currentColor" 
        strokeWidth="1.5" 
      />
    </svg>
  ),
  WalletMoney: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      {/* 1. Le billet (dessiné en premier pour passer derrière l'avant du portefeuille) */}
      <path d="M8 11V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5" />
      
      {/* Détails du billet : arcs inversés aux coins supérieurs */}
      <path d="M8 6a2 2 0 0 0 2-2" />
      <path d="M16 6a2 2 0 0 1-2-2" />
      
      {/* Détail du billet : encoche en demi-cercle à la base */}
      <path d="M10 11a2 2 0 0 1 4 0" />

      {/* 2. Le corps du portefeuille (Ligne continue avec un espace calibré à l'avant) */}
      <path d="M9 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H7.5" />
    </svg>
  ),
  // 4. Icône Stylo et dessin (Design / Signature)
  PenDraw: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      {/* Ligne ondulée (gribouillis) */}
      <path d="M3 13c1 0 2-2 4-2s2 4 4 4 2-2 3-2" />
      {/* Corps principal du stylo incliné */}
      <path d="M17.5 4.5a2.121 2.121 0 0 1 3 3L13 15l-4 1 1-4 7.5-7.5z" />
      {/* Ligne de séparation du capuchon */}
      <path d="M16 6l2 2" />
      {/* Ligne de séparation de la pointe */}
      <path d="M12.5 13.5l1 1" />
      {/* Clip du stylo */}
      <path d="M19.5 6.5l1.5 1.5" />
    </svg>
  ),
  LawScale: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      {/* Base et axe central */}
      <path d="M8 21h8" />
      <path d="M12 3v18" />
      <circle cx="12" cy="5" r="2" />
      
      {/* Fléau (bras horizontal) */}
      <path d="M3 7h18" />
      
      {/* Plateau gauche */}
      <path d="M2 16l3-9 3 9c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" />
      
      {/* Plateau droit */}
      <path d="M16 16l3-9 3 9c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" />
    </svg>
  ),
  WebsiteCookie: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      {/* Forme du cookie avec la "morsure" (le contour du haut à droite) */}
      <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5z" />
      
      {/* Les pépites / points de données à l'intérieur */}
      <path d="M6 14h.01" strokeWidth="3" />
      <path d="M11 17h.01" strokeWidth="3" />
      <path d="M16 14h.01" strokeWidth="3" />
      <path d="M10 10h.01" strokeWidth="3" />
      <path d="M7 8h.01" strokeWidth="3" />
    </svg>
  ),
  CodeSlash: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      {/* Chevron gauche < */}
      <polyline points="8 7 3 12 8 17" />
      
      {/* Barre oblique de fermeture / */}
      <line x1="14" y1="5" x2="10" y2="19" />
      
      {/* Chevron droit > */}
      <polyline points="16 7 21 12 16 17" />
    </svg>
  ),
  TrendUp: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      {/* Les 4 barres verticales du graphique */}
      <path d="M3 20v-4" />
      <path d="M8 20v-7" />
      <path d="M13 20v-9" />
      <path d="M18 20v-5" />
      
      {/* La ligne brisée ascendante avec sa flèche */}
      <path d="M2 13.5l4-4.5 4.5 3.5 11.5-10" />
      <polyline points="17 2.5 22 2.5 22 7.5" />
    </svg>
  ),
  ServicePro: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  ),
  FlexibleSliders: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  FlexibleSolutions: ({ size = 24, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true" {...props}
  >
    {/* Slider 1 — handle à 65% */}
    <line x1="4" y1="6" x2="12" y2="6" />
    <circle cx="14" cy="6" r="2" />
    <line x1="16" y1="6" x2="20" y2="6" />

    {/* Slider 2 — handle à 25% */}
    <line x1="4" y1="12" x2="6" y2="12" />
    <circle cx="8" cy="12" r="2" />
    <line x1="10" y1="12" x2="20" y2="12" />

    {/* Slider 3 — handle à 75% */}
    <line x1="4" y1="18" x2="14" y2="18" />
    <circle cx="16" cy="18" r="2" />
    <line x1="18" y1="18" x2="20" y2="18" />
  </svg>
),
EagleLogo: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 196 196"
      preserveAspectRatio="xMidYMid meet"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true" {...props}
    >
      <g 
        transform="translate(0, 196) scale(0.100000, -0.100000)"
        fill="#1a3969"
        stroke="none"
      >
        <path d="M895 1929 c-105 -8 -154 -18 -250 -54 -288 -108 -514 -358 -597 -660
        -31 -116 -31 -364 0 -480 87 -318 320 -565 634 -670 106 -36 122 -39 258 -43
        168 -5 243 8 387 64 278 107 489 342 575 640 31 108 33 380 4 489 -43 162
        -147 337 -266 449 -212 200 -452 285 -745 265z m333 -88 c93 -27 221 -91 294
        -147 86 -66 184 -180 237 -274 49 -86 100 -224 88 -236 -4 -4 -48 14 -99 39
        -107 52 -166 71 -290 92 -130 23 -182 14 -235 -41 l-42 -43 -10 47 c-5 26 -8
        49 -5 51 3 3 33 13 67 22 34 10 89 25 122 34 73 21 235 16 305 -9 l45 -16 -48
        45 c-59 54 -151 99 -231 114 -123 22 -269 10 -348 -30 -72 -37 -161 -132 -215
        -231 -47 -85 -93 -203 -82 -211 2 -2 28 -1 57 1 37 3 52 8 52 18 0 8 12 38 26
        66 l26 51 21 -21 c20 -21 20 -23 4 -57 -22 -46 -22 -45 16 -45 63 1 158 28
        254 73 54 25 116 48 138 51 22 4 140 1 261 -6 l222 -12 11 -67 c6 -37 11 -100
        11 -138 l0 -71 -82 83 c-94 94 -164 134 -287 161 -100 22 -135 20 -184 -8 -57
        -33 -159 -76 -232 -97 l-60 -18 42 0 c147 -3 378 -61 519 -131 88 -44 216
        -132 235 -163 8 -11 -19 -97 -29 -97 -4 0 -27 23 -50 51 -89 102 -246 199
        -403 247 -72 22 -292 56 -330 50 -22 -3 -20 -6 26 -37 128 -88 250 -239 276
        -341 7 -27 16 -50 20 -50 4 0 10 20 13 45 4 25 11 45 16 45 14 0 86 -89 108
        -134 12 -23 34 -78 51 -123 l30 -82 -37 -31 c-20 -16 -39 -30 -43 -30 -4 0 -9
        22 -13 49 -4 27 -18 76 -32 108 l-26 58 -17 -25 c-31 -46 -64 -81 -73 -78 -6
        2 -19 36 -29 75 -22 90 -75 203 -125 270 -53 71 -154 136 -234 152 -34 7 -63
        11 -65 9 -2 -2 19 -29 46 -61 34 -38 62 -85 86 -144 33 -82 36 -95 35 -188 0
        -55 -6 -113 -12 -129 -6 -16 -8 -32 -4 -35 8 -9 80 77 102 123 l19 40 14 -25
        c20 -35 17 -211 -5 -269 -29 -76 -36 -80 -150 -80 -153 0 -256 20 -375 73
        l-45 20 76 21 c183 53 277 192 248 370 -13 81 -20 100 -59 158 -33 49 -58 74
        -67 66 -3 -3 0 -27 7 -52 20 -79 7 -185 -31 -263 -50 -101 -148 -191 -243
        -222 -36 -12 -41 -11 -78 15 -88 60 -193 192 -259 323 -85 170 -108 417 -57
        614 90 341 363 593 717 661 14 2 93 3 175 1 117 -2 166 -7 223 -24z m-90 -546
        c19 -42 14 -74 -17 -106 -37 -36 -99 -41 -131 -9 -25 25 -25 32 -2 53 16 15
        19 15 30 -3 14 -22 52 -26 70 -8 16 16 15 43 -3 58 -12 10 -13 16 -4 26 18 22
        45 16 57 -11z"/>
        <path d="M890 1501 c-90 -30 -188 -92 -261 -165 -38 -37 -69 -72 -69 -78 0 -5
        26 9 58 30 31 22 67 43 78 46 21 6 21 5 16 -84 -2 -49 -3 -90 0 -90 3 0 13 21
        23 48 19 50 93 171 129 211 11 13 43 41 69 62 55 44 44 49 -43 20z"/>
        <path d="M549 1153 c-165 -169 -188 -223 -158 -365 9 -44 21 -63 65 -107 30
        -30 56 -52 59 -49 3 2 -2 23 -11 46 -19 47 -13 101 15 126 40 36 238 100 356
        114 l70 8 -53 17 c-28 9 -90 19 -137 23 l-85 7 0 36 c0 52 -23 231 -30 231 -3
        0 -44 -39 -91 -87z"/>
      </g>
    </svg>
  ),
  MobileDev: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      {/* Contour du smartphone */}
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      {/* Bouton d'accueil en bas */}
      <path d="M12 18h.01" />
      {/* Chevron gauche (Code) */}
      <path d="M9.5 9.5 7 12l2.5 2.5" />
      {/* Chevron droit (Code) */}
      <path d="M14.5 9.5 17 12l-2.5 2.5" />
    </svg>
  ),
  WebDevBrowser: ({ size = 24, className, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true" {...props}
    >
      {/* Contour du navigateur */}
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      {/* Ligne séparatrice de la barre supérieure (header/URL) */}
      <line x1="3" y1="9" x2="21" y2="9" />
      {/* Chevron de code gauche "<" */}
      <path d="M10 13l-2 2 2 2" />
      {/* Chevron de code droit ">" */}
      <path d="M14 13l2 2-2 2" />
    </svg>
  ),
  VisibilitySurvey: ({ size = 24, className, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true" {...props}
    >
      {/* Le Clip du porte-bloc (Survey) */}
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      {/* Le contour du document */}
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      {/* L'œil (Awareness / Visibilité) */}
      <path d="M7 13c1.5-2 3.5-3 5-3s3.5 1 5 3c-1.5 2-3.5 3-5 3s-3.5-1-5-3z" />
      <circle cx="12" cy="13" r="1.5" />
    </svg>
  ),
  BusinessPlanDoc: ({ size = 24, className, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true" {...props}
    >
      {/* Contour du document avec le coin plié */}
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      {/* Courbe de croissance (flèche vers le haut) */}
      <path d="M8 16l2.5-2.5 2 2 3.5-3.5" />
      <path d="M16 12v0" /> {/* Petit point d'arrivée */}
    </svg>
  ),
  MarketingMegaphone: ({ size = 24, className, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true" {...props}
    >
      {/* Le corps du porte-voix */}
      <path d="m3 11 18-5v12L3 14v-3z" />
      {/* La poignée */}
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
    // ============================================================
  // 7. ICÔNES DÉDIÉES AU FORMULAIRE DE CANDIDATURE
  // ============================================================

  // Niveau d'études (distincte de GraduationCap, déjà utilisée pour la filière)
  Layers: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),

  // Département souhaité (remplace Code, trop connoté "IT" pour un choix
  // qui couvre aussi Marketing, Études et Dev-Co)
  Building: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <rect x="8" y="6" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="14" y="6" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="8" y="11" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="14" y="11" width="2" height="2" fill="currentColor" stroke="none" />
      <path d="M9 22v-5h6v5" />
    </svg>
  ),

  // Niveau en français (distincte du niveau en anglais)
  BadgeFR: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="Arial, sans-serif">FR</text>
    </svg>
  ),

  // Niveau en anglais (distincte du niveau en français)
  BadgeEN: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="Arial, sans-serif">EN</text>
    </svg>
  ),

  // Motivation (remplace la répétition de Heart entre la légende et le champ)
  Sparkles: ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true" {...props}
    >
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
      <path d="M5 15l.5 1.5L7 17l-1.5.5L5 19l-.5-1.5L3 17l1.5-.5L5 15z" />
    </svg>
  ),

};