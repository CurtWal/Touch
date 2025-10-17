import { useState, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import Upload from "./components/Upload";
import PostForm from "./components/PostForm";
import PostList from "./components/PostList";
import PostBulkUpload from "./components/PostBulkUpload";
import AiChat from "./components/AiChat";
import axios from "axios";
import Register from "./components/Register";
import Login from "./components/Login";
import Home from "./components/Home";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  Link,
} from "react-router-dom";
import { jwtDecode } from "jwt-decode";

function Layout() {
  window.onscroll = () => {
    let header = document.querySelector(".header");
    header.classList.toggle("sticky", window.scrollY > 100);
  };

  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    setIsLoggedIn(false); // Update state after logout
    window.location.href = "/login";
  };

  const closeModal = () => {
    setShowModal(false);
  };

  useEffect(() => {
    if (location.pathname === "/") {
      document.body.style.backgroundColor = "black";
    } else {
      document.body.style.backgroundColor = "#1470AF";
    }

    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [location.pathname, isLoggedIn]);
  useEffect(() => {
    const token = localStorage.getItem("token");

    if (token) {
      const { exp } = jwtDecode(token); // Extract the expiration time
      const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

      // Calculate time until token expires
      const timeUntilExpiry = (exp - currentTime) * 1000;

      if (timeUntilExpiry > 0) {
        setTimeout(() => {
          alert("Session expired. Please log in again.");
          logout(); // Call your logout function
          window.location.href = "/login"; // Redirect to login page
        }, timeUntilExpiry);
      } else {
        // If token is already expired, logout immediately
        logout();
      }
    }
  }, []);
  // const hasRole = (targetRoles) => {
  //   try {
  //     const role = JSON.parse(localStorage.getItem("role") || "[]");
  //     const userRoles = Array.isArray(role) ? role : [role];
  //     return userRoles.some((r) => targetRoles.includes(r));
  //   } catch (e) {
  //     return false;
  //   }
  // };
  // function hasAdminRole(roleName) {
  //   try {
  //     const role = JSON.parse(localStorage.getItem("role") || "[]");
  //     return Array.isArray(role) ? role.includes(roleName) : role === roleName;
  //   } catch (e) {
  //     return false;
  //   }
  // }
  return (
    <>
      <div>
        <header class="header">
          <h4>Touch</h4>
          <nav class="navbar" style={{ display: "inline-flex", gap: "15px" }}>
            
            <Link to="/" className="!text-black hover:!text-red-500">
              Home
            </Link> 
            {isLoggedIn && (
              <div style={{ display: "inline-flex",  }}>
                <p
                  onClick={logout}
                  className="!text-black hover:!text-red-500 cursor-pointer font-semibold w-15"
                >
                  Logout
                </p>
              </div>
            )}
            {!isLoggedIn && (
              <div style={{ display: "inline-flex", gap: "15px" }}> 
                <Link to="/login" className="!text-black hover:!text-red-500">
              Login
            </Link>
            <Link to="/register" className="!text-black hover:!text-red-500">
              Register
            </Link> 
              </div>
            )}
           
          </nav>
        </header>
      </div>
      <div className="Main-content">
        <Routes>
                  <Route path="/register" element={<Register />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/" element={<Home isLoggedIn={isLoggedIn}/>} />
                </Routes></div>
    </>
  );
}
function App() {
  //const [count, setCount] = useState(0)
  // function logOut() {
  //   localStorage.removeItem("token");
  //   localStorage.removeItem("userId");
  //   alert("Logged out");
  //   window.location.reload();
  // }
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>

    //     <>
    //     <Register/>
    //     <Login/>
    //     {localStorage.getItem("token") && (
    //       <div>
    // <div>Logged in as {localStorage.getItem("token")}</div>
    //       <button onClick={logOut} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded mb-4">Log Out</button>
    //       </div>

    //     )
    // }
    //     <h1>Upload Csv or xlsx</h1>
    //      <Upload/>
    //      <PostBulkUpload/>
    //       <PostForm/>
    //       <PostList/>
    //       <AiChat/>
    //     </>
  );
}

export default App;
