import {React, useState, useEffect} from "react";
import Upload from "./Upload";
import AiChat from "./AiChat";
import CommandSender from "./CommandSender";
import FollowUpToggle from "./FollowUpToggle";  
import  LinkedInSection  from "./LinkedInSection";
import PostBulkUpload from "./PostBulkUpload";
import PostForm from "./PostForm";
import PostList from "./PostList";
import CalendarPage from "./CalendarPage";
import TwitterSection from "./TwitterSection";
import { Navbar } from "./LandingPage";
export default function Home({isLoggedIn}) {
    
    return (
        <div className="Home">
            {isLoggedIn &&(
            <>
            <Navbar />
            {/* 
            
            <AiChat /> */}
            <Upload />
            <CommandSender />
            <FollowUpToggle />
            <LinkedInSection />
            <TwitterSection />
            <CalendarPage />
            {/* <PostBulkUpload />
            <PostList /> */}
            </>
            )}
            
        </div>
    );
}
