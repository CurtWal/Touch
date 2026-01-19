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
            const response = await axios.post('http://localhost:3000/login', {
                email: email.value,
                password: password.value,
            });
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('userId', response.data.user.id);
            console.log(localStorage.getItem('userId'));
            alert('Login successful!');
            navigate("/home");
            window.location.reload();
        } catch (error) {
            alert('Login failed: ' + error.response.data.error);
        }   
    };
    return (
        <div className='dark:text-white p-4 max-w-md mx-auto mt-10 border rounded bg-white dark:bg-gray-800'>
        <form onSubmit={handleLogin} className=' flex flex-col gap-4'>   
            <h2 className=''>Login</h2>
            <div className='flex flex-col gap-4'>
            <div className='flex flex-col'>
                <label className='flex justify-start'>Email:</label>
                <input className=" bg-gray-300 text-black" type="email" name="email" required />
            </div>
            <div className='flex flex-col'>
                <label className="flex justify-start">Password:</label>
                <input className=" bg-gray-300 text-black" type="password" name="password" required />
            </div>
            </div>
            <button type="submit">Login</button>
        </form>
        </div>
    );
}
export default Login;