import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import PostImg from "../assets/PostCalendar.png";
import CrmImg from "../assets/CrmImg.png";
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar/>
      <HeroSection />
      <CrmSection />
      <PricingSection />
    </div>
  );
}
export function Navbar() {
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem("token")
  );

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem("token"));
  }, [location.pathname]);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    window.location.href = "/";
  };

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b bg-white shadow-md sticky top-0 z-30">
      <h1 className="text-2xl font-bold text-black">Touch</h1>

      <div className="flex gap-4 items-center">
        {!isLoggedIn ? (
          <>
            <Link
              to="/login"
              className="!text-black !hover:text-red-500 font-medium"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="!text-black !hover:text-red-500 font-medium"
            >
              Register
            </Link>
          </>
        ) : (
          <p
            onClick={logout}
            className="text-black hover:text-red-500 font-semibold cursor-pointer"
          >
            Logout
          </p>
        )}
      </div>
    </header>
  );
}
function HeroSection() {
  return (
    <section className="grid md:grid-cols-2 gap-10 px-8 py-20 items-center">
      <div>
        <h2 className="text-4xl font-bold mb-4">
          Schedule your content. Stay consistent.
        </h2>
        <p className="text-lg text-gray-600 mb-6">
          Touch lets you plan, schedule, and publish posts across platforms
          using a simple calendar-based workflow.
        </p>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50">
        {/* Placeholder image */}
        <img
          src={PostImg}
          alt="Scheduled posts calendar"
          className="w-full rounded-md"
        />
      </div>
    </section>
  );
}
function CrmSection() {
  return (
    <section className="grid md:grid-cols-2 gap-10 px-8 py-20 items-center bg-gray-50">
      <div className="order-2 md:order-1 border rounded-lg p-4 bg-white">
        <img src={CrmImg} alt="CRM uploader" className="w-full rounded-md" />
      </div>

      <div className="order-1 md:order-2">
        <h2 className="text-3xl font-bold mb-4">
          Upload contacts. Personalize outreach.
        </h2>
        <p className="text-lg text-gray-600">
          Import your CRM data to generate targeted content and automate social
          engagement based on real contact information.
        </p>
      </div>
    </section>
  );
}
function PricingSection() {
  return (
    <section className="px-8 py-20">
      <h2 className="text-3xl font-bold text-center mb-10">Simple pricing</h2>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <PricingCard
          title="Starter"
          price="$19/mo"
          features={["Scheduled posts", "1 social account", "Basic analytics"]}
        />

        <PricingCard
          title="Pro"
          price="$49/mo"
          features={[
            "Multiple platforms",
            "CRM upload",
            "Automations",
            "AI Assistant",
          ]}
          highlighted
        />

        <PricingCard
          title="Business"
          price="$99/mo"
          features={["Team access", "Advanced analytics", "Priority support"]}
        />
      </div>
    </section>
  );
}
function PricingCard({ title, price, features, highlighted }) {
  return (
    <div
      className={`border rounded-lg p-6 text-center ${
        highlighted ? "border-black shadow-lg" : ""
      }`}
    >
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-3xl font-bold mb-4">{price}</p>

      <ul className="text-gray-600 mb-6 space-y-2">
        {features.map((f) => (
          <li key={f}>• {f}</li>
        ))}
      </ul>

      <Link
        to="/register"
        className={`block px-4 py-2 rounded-md ${
          highlighted ? "bg-black text-white" : "border border-black text-black"
        }`}
      >
        Get Started
      </Link>
    </div>
  );
}
