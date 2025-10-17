import React, { Component } from 'react';
import axios from 'axios';
import {
  useNavigate,
  BrowserRouter as Router,
  Route,
  Link,
  Routes,
} from "react-router-dom";
function Login() {
      const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault(); 
        const { email, password } = e.target.elements;
        try {
            const response = await axios.post('https://touch-six.vercel.app/login', {
                email: email.value,
                password: password.value,
            });
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('userId', response.data.user.id);
            console.log(localStorage.getItem('userId'));
            alert('Login successful!');
            navigate("/");
            window.location.reload();
        } catch (error) {
            alert('Login failed: ' + error.response.data.error);
        }   
    };
    return (
        <form onSubmit={handleLogin}>   
            <h2>Login</h2>
            <div>
                <label>Email:</label>
                <input type="email" name="email" required />
            </div>
            <div>
                <label>Password:</label>
                <input type="password" name="password" required />
            </div>
            <button type="submit">Login</button>
        </form>
    );
}
export default Login;