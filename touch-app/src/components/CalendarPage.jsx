// CalendarPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import PostForm from "./PostForm";
import DayPostsPanel from "./DayPostsPanel";
import axios from "axios";
import PostBulkUpload from "./PostBulkUpload";

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
function startWeekday(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay(); // 0 = Sun
}
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CalendarPage() {
  const [now] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(now));
  const [posts, setPosts] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null); // Date object
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const getDefaultDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30); // add 30 mins
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  // datetime-local expects "YYYY-MM-DDTHH:MM"
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

  // fetch posts (all for user) and map to date keys
  const fetchPosts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:3000/api/posts", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setPosts(data || []);
    } catch (err) {
      console.error("failed fetching posts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  // group posts by YYYY-MM-DD
  const postsByDate = useMemo(() => {
    const map = {};
    for (const p of posts) {
      if (!p.scheduled_at) continue;
      const d = new Date(p.scheduled_at);
      const key = formatDateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return map;
  }, [posts]);

  // calendar generation
  const blanks = startWeekday(currentMonth);
  const totalDays = daysInMonth(currentMonth);

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  // open modal for a date
  const onDateClick = (day) => {
    const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    setSelectedDate(dateObj);
    setShowModal(true);
  };

  // when a new post is saved in the modal
  const handlePostSaved = (newPost) => {
    // add to posts state
    setPosts((prev) => [newPost, ...prev]);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Schedule Calendar</h1>
          <p className="text-sm text-white-500">Click a date to schedule posts. Multiple posts per date supported.</p>
          <PostBulkUpload onUploadSuccess={fetchPosts}/>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="px-3 py-1 rounded hover:bg-gray-100">
            ◀
          </button>
          <div className="px-4 py-2 font-semibold">
            {currentMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
          </div>
          <button onClick={nextMonth} className="px-3 py-1 rounded hover:bg-gray-100">
            ▶
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-7 gap-2 text-sm text-center font-medium text-gray-600">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        <div className="mt-2 overflow-x-auto">
          <div className="grid grid-cols-7 gap-2">
            {/* blank slots */}
            {Array.from({ length: blanks }).map((_, i) => (
              <div key={`b-${i}`} className="h-28 border border-gray-100 bg-gray-50 rounded p-2" />
            ))}

            {/* days */}
            {Array.from({ length: totalDays }).map((_, idx) => {
              const day = idx + 1;
              const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
              const key = formatDateKey(dateObj);
              const dayPosts = postsByDate[key] || [];
              const isToday = formatDateKey(dateObj) === formatDateKey(new Date());
              return (
                <div
                  key={key}
                  className={`h-28 border border-gray-100 rounded p-2 flex flex-col justify-between cursor-pointer hover:shadow-sm transition ${
                    isToday ? "ring-2 ring-blue-200" : ""
                  }`}
                  onClick={() => onDateClick(day)}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-sm font-medium text-black">{day}</div>
                    {dayPosts.length > 0 && (
                      <div className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">{dayPosts.length} post{dayPosts.length>1?'s':''}</div>
                    )}
                  </div>

                  <div className="text-xs text-gray-500">
                    {/* show first 2 posts preview */}
                    {dayPosts.slice(0,2).map((p) => (
                      <div key={p._id} className="truncate">
                        • {p.body_text?.slice(0,40) || "(no text)"}
                      </div>
                    ))}
                    {dayPosts.length > 2 && <div className="text-xs text-gray-400">+ {dayPosts.length - 2} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && selectedDate && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4">
          <div className="bg-white w-full max-w-4xl rounded-lg shadow-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-semibold text-black">Schedule post for {selectedDate.toDateString()}</h3>
                <p className="text-sm text-gray-500">You can create multiple posts on the same date.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowModal(false); setSelectedDate(null); }}
                  className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
              <div>
                <PostForm
                  initialScheduledAt={getDefaultDateTime(selectedDate)}
                  onSave={(post) => {
                    handlePostSaved(post);
                  }}
                />
              </div>

              <div>
                <DayPostsPanel
                  date={selectedDate}
                  posts={postsByDate[formatDateKey(selectedDate)] || []}
                  onApproved={() => fetchPosts()}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
