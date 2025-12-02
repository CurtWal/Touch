import React from "react";
import Upload from "./Upload";
import AiChat from "./AiChat";
import CommandSender from "./CommandSender";
import FollowUpToggle from "./FollowUpToggle";
import { useState, useEffect } from "react";   
import  LinkedInSection  from "./LinkedInSection";
import PostBulkUpload from "./PostBulkUpload";
import PostForm from "./PostForm";
import PostList from "./PostList";
import CalendarPage from "./CalendarPage";

export default function Home({isLoggedIn}) {
    return (
        <div className="Home">
            <h1>Welcome to the Home Page</h1>
            <p>This is the main landing page of the application.</p>
            {isLoggedIn &&(
            <>
            {/* 
            <FollowUpToggle />
            
            <AiChat /> */}
            <Upload />
            <CommandSender />
            <LinkedInSection />
            <CalendarPage />
            {/* <PostBulkUpload />
            <PostList /> */}
            </>
            )}
            
        </div>
    );
}
