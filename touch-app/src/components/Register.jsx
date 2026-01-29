import React, { Component } from 'react';
import axios from 'axios';
import { Navbar } from "./LandingPage";
import { useNavigate } from 'react-router-dom';

function Register() {
    const navigate = useNavigate();
    
    const handleRegister = async (e) => {
        e.preventDefault();
        const { name,email, password, phone } = e.target.elements;
        try {
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/register`, {
                name: name.value,
                email: email.value,
                password: password.value,
                phone: phone.value
            });
            alert('Registration successful! Redirecting to login...');
            navigate('/login');
        } catch (error) {
            alert('Registration failed: ' + error.response.data.error);
        }
    };  
    return (
        <>
        <Navbar />
        <div className='dark:text-white p-4 max-w-md mx-auto mt-10 border rounded bg-white dark:bg-gray-800'>
        <form onSubmit={handleRegister} className=' flex flex-col gap-4'>
            <h2>Register</h2>
            <div className='flex flex-col gap-4'>
            <div className='flex flex-col'>
                <label className='flex justify-start'>Name:</label>
                <input className=" bg-gray-300 text-black" type="text" name="name" required />
            </div>
            <div className='flex flex-col'>
                <label className='flex justify-start'>Email:</label>
                <input className=" bg-gray-300 text-black" type="email" name="email" required />
            </div>
            <div className='flex flex-col'>
                <label className='flex justify-start'>Phone Number:</label>
                <input className=" bg-gray-300 text-black" type="tel" name="phone" required />
            </div>
            <div className='flex flex-col'>
                <label className='flex justify-start'>Password:</label>
                <input className=" bg-gray-300 text-black" type="password" name="password" required />
            </div>
            </div>
            <button type="submit">Register</button>
        </form>
        </div>
        </>
    );
}
export default Register;