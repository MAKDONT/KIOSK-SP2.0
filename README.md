<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# KIOSK-SP2.0 — Queue Management System

A kiosk-based faculty queue management system built for EARIST, allowing students to queue up for faculty consultations via a kiosk, web, or mobile interface.

View your app in AI Studio: https://ai.studio/apps/958af7ac-0212-4f97-9c34-bbfc858c38d4

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| [React 19](https://react.dev/) | UI framework |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe JavaScript |
| [Vite 6](https://vite.dev/) | Build tool & dev server |
| [Tailwind CSS v4](https://tailwindcss.com/) | Utility-first CSS styling |
| [React Router DOM v7](https://reactrouter.com/) | Client-side routing |
| [Lucide React](https://lucide.dev/) | Icon library |
| [Motion](https://motion.dev/) | Animations |
| [clsx](https://github.com/lukeed/clsx) + [tailwind-merge](https://github.com/dcastil/tailwind-merge) | Conditional class name utilities |
| [date-fns](https://date-fns.org/) | Date/time formatting |

### Backend
| Technology | Purpose |
|---|---|
| [Node.js ≥ 20](https://nodejs.org/) | JavaScript runtime |
| [Express.js](https://expressjs.com/) | HTTP server & REST API |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe server code |
| [tsx](https://github.com/privatenumber/tsx) | TypeScript execution for Node.js |
| [ws](https://github.com/websockets/ws) | WebSocket server for real-time updates |
| [Multer](https://github.com/expressjs/multer) | File upload handling |

### Database & BaaS
| Technology | Purpose |
|---|---|
| [Supabase](https://supabase.com/) | PostgreSQL database + real-time subscriptions |

### AI & External APIs
| Technology | Purpose |
|---|---|
| [Google Gemini AI](https://ai.google.dev/) | AI-powered features via `@google/genai` |
| [Google APIs](https://developers.google.com/) | Google services integration (e.g. Meet links) |

### Email
| Technology | Purpose |
|---|---|
| [SendGrid](https://sendgrid.com/) | Transactional email delivery |
| [Nodemailer](https://nodemailer.com/) | SMTP email sending |

### Deployment
| Platform | Config file |
|---|---|
| [Railway](https://railway.app/) | `railway.json`, `nixpacks.toml`, `Procfile` |
| [Render](https://render.com/) | `render.yaml` |

---

## Run Locally

**Prerequisites:**  Node.js ≥ 20

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and fill in the required environment variables (Supabase URL/key, Gemini API key, SendGrid key, etc.)
3. Run the app:
   `npm run dev`
