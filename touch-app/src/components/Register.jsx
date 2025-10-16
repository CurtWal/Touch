import React, { Component } from 'react';
import axios from 'axios';

function Register() {
    const handleRegister = async (e) => {
        e.preventDefault();
        const { name,email, password } = e.target.elements;
        try {
            const response = await axios.post('http://localhost:3000/register', {
                name: name.value,
                email: email.value,
                password: password.value,
            });
            alert('Registration successful! Please log in.');
        } catch (error) {
            alert('Registration failed: ' + error.response.data.error);
        }
    };  
    return (
        <form onSubmit={handleRegister}>
            <h2>Register</h2>
            <div>
                <label>Name:</label>
                <input type="text" name="name" required />
            </div>
            <div>
                <label>Email:</label>
                <input type="email" name="email" required />
            </div>
            <div>

                <label>Password:</label>
                <input type="password" name="password" required />
            </div>
            <button type="submit">Register</button>
        </form>
    );
}
export default Register;