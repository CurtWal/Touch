import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Upload from './components/Upload'
import PostForm from './components/PostForm'
import PostList from './components/PostList'
import PostBulkUpload from './components/PostBulkUpload'
import AiChat from './components/AiChat'

function App() {
  //const [count, setCount] = useState(0)

  return (
    <>
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
