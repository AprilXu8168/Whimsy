// src/App.js
import React from "react";
import Timer from "./components/Timer";
import ChatBubble from "./components/ChatBubble";
import { SpeedInsights } from "@vercel/speed-insights/next";

const App = () => {
  const startDate = "2024-11-05T18:15:00Z"; // Example date

  return (
    <div
      style={{
        padding: "20px",
        fontFamily: "'Caveat', cursive",
        background: "linear-gradient(135deg, #ffe4e1, #ffb6c1)",
        borderRadius: "15px",
        boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.2)",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "3rem",
          color: "#ff69b4",
          textShadow: "2px 2px 5px rgba(0, 0, 0, 0.3)",
          marginBottom: "20px",
          animation: "pulse 2s infinite",
        }}
      >
        ❤️ I Love You In React
      </h1>
      <Timer startDate={startDate} />
      <hr style={{ borderColor: "#ff69b4", margin: "20px 0" }} />
      <ChatBubble />
      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
        `}
      </style>
    </div>
  );
}

export default App;
