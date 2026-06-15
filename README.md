# ⚡ AI-Native B2C CRM

A next-generation, AI-powered Customer Relationship Management (CRM) system designed for omnichannel B2C marketing. Built with modern web technologies, this platform features an intelligent dynamic routing engine, real-time message tracking, and proactive AI-driven insights to maximize customer engagement and minimize delivery failures.

**🟢 Live Demo (Frontend):** [https://b2-c-ai-native-crm-frontend.vercel.app](https://b2-c-ai-native-crm-frontend.vercel.app)  
**⚙️ Live API (Backend):** [https://b2c-ai-native-crm.onrender.com/api/health](https://b2c-ai-native-crm.onrender.com/api/health)

---

## 🚀 Key Features

- **Omnichannel Dispatch Engine**: Seamlessly simulate bulk messaging campaigns across multiple channels including SMS, Email, WhatsApp, and RCS.
- **Dynamic Optimization Routing (AI Fallback)**: Intelligently prevents delivery failures. If a campaign targets a specific channel (e.g., EMAIL) but a customer lacks that contact method, the engine dynamically reroutes the message to their available fallback channel, rescuing the delivery.
- **Strict VIP Guardrails**: Protects high-value customers by rigidly enforcing their `predicted_preferred_channel`, ensuring VIPs are never spammed on secondary channels.
- **Real-Time Delivery Funnel**: Powered by **Supabase Realtime WebSockets**, the dashboard provides a live, continuously updating event feed tracking the realistic lifecycle of messages (`PENDING` → `SENT` → `DELIVERED` → `OPENED` → `CLICKED`).
- **Proactive AI Insights**: Integrates with LLMs to analyze historical dispatch data and customer segments. It automatically surfaces actionable shopper suggestives and generates highly tailored, ready-to-send message drafts using universal placeholders.
- **Premium User Interface**: A beautifully crafted, responsive dark-mode dashboard featuring glassmorphism, micro-animations, and interactive KPI metrics for deep contextual drill-downs.

---

## 🛠️ Tech Stack

### Frontend
- **React.js (Vite)**: Lightning-fast, modern component architecture.
- **Tailwind CSS**: Utility-first styling for a sleek, highly customized dark UI.
- **Lucide React**: Crisp, modern iconography.
- **Supabase Realtime**: WebSocket integration for live UI updates without polling.

### Backend
- **Node.js & Express**: High-performance, scalable API services.
- **Prisma ORM**: Type-safe database interactions and schema management.
- **PostgreSQL (Supabase)**: Robust relational database for managing customers, campaigns, and historical logs.
- **Generative AI Integration**: Powered by LLMs for automated data analysis and copywriting.

### Architecture
- **Microservices-inspired**: Distinct services for CRM logic, AI endpoints, and a dedicated `mock-channel` webhook service that simulates a realistic marketing drop-off funnel.

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js (v20+)
- npm or yarn
- A Supabase project with a PostgreSQL database
- An AI API Key (e.g., Google Gemini / OpenAI)

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/b2c-ai-native-crm.git
cd b2c-ai-native-crm
npm install
```

### 2. Environment Variables
Create a `.env` file in the root directory and configure your credentials:
```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
VITE_SUPABASE_URL="https://[YOUR_PROJECT_ID].supabase.co"
VITE_SUPABASE_KEY="your-anon-key"
GEMINI_API_KEY="your-api-key"
```

### 3. Database Migration & Seeding
Initialize the database schema and populate it with seed data:
```bash
cd services/crm
npx prisma generate
npx prisma db push
node seed.js
```

### 4. Run the Application
The project uses `concurrently` to run the frontend, backend, and mock services simultaneously:
```bash
# From the root directory
npm run dev
```

The application will be available at:
- Frontend: `http://localhost:5173`
- CRM Backend: `http://localhost:5001`
- Mock Webhook Service: `http://localhost:5002`

---

## 📈 System Logic & Math

The application goes beyond simple CRUD operations to implement production-grade business logic:
- **Optimization Rate Calculation**: Accurately measures the success rate of the dynamic routing engine by calculating `(Optimized Fallbacks / Total Initial Failures)`.
- **Idempotency**: Webhook endpoints enforce strict idempotency keys to prevent duplicate event processing during network retries.
- **Realistic Funnel Simulation**: The mock service introduces calculated jitter and statistical drop-offs (e.g., 90% delivery rate, 20% click-through rate) to mimic genuine consumer behavior.

---
