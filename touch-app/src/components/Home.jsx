import React from "react";
import Upload from "./Upload";
import AiChat from "./AiChat";
import { useState, useEffect } from "react";   

export default function Home({isLoggedIn}) {
    return (
        <div className="Home">
            <h1>Welcome to the Home Page</h1>
            <p>This is the main landing page of the application.</p>
            {isLoggedIn &&(
            <>
            <Upload />
            <AiChat />
            </>
            )}
            
        </div>
    );
}
