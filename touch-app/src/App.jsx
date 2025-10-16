import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Upload from './components/Upload'
import PostForm from './components/PostForm'
import PostList from './components/PostList'
import PostBulkUpload from './components/PostBulkUpload'
import AiChat from './components/AiChat'
import axios from 'axios'
import Register from './components/Register'
import Login from './components/Login'

function App() {
  //const [count, setCount] = useState(0)
function logOut() {
  localStorage.removeItem("token");
  localStorage.removeItem("userId");
  alert("Logged out");
  window.location.reload();
}
  return (
    <>
    <Register/>
    <Login/>
    {localStorage.getItem("token") && (
      <div>
<div>Logged in as {localStorage.getItem("token")}</div>
      <button onClick={logOut} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded mb-4">Log Out</button>
      </div>
      
      
    )
}
    <h1>Upload Csv or xlsx</h1>
     <Upload/>
     <PostBulkUpload/>
      <PostForm/> 
      <PostList/> 
      <AiChat/>
    </>
  )
}

export default App
