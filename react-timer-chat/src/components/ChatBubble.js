// src/components/RomanticChatWithTimeline.js
import React, { useState } from "react";

const RomanticChatWithTimeline = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const timeline = [
    { date: "01/11/2024", event: "First conversation on WeChat" },
    { date: "05/11/2024", event: "First meeting in person" },
  ];

  const handleSendMessage = () => {
    if (input.trim()) {
      setMessages((prev) => [...prev, { text: input, user: true }]);
      setInput("");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.chatSection}>
        <div style={styles.header}>💖 Love Chat 💖</div>
        <div style={styles.chatWindow}>
          {messages.map((message, index) => (
            <div
              key={index}
              style={{
                ...styles.bubble,
                ...(message.user ? styles.userBubble : styles.otherBubble),
              }}
            >
              <p style={styles.text}>{message.text}</p>
            </div>
          ))}
        </div>
        <div style={styles.inputSection}>
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your love note..."
          />
          <button style={styles.sendButton} onClick={handleSendMessage}>
            💌 Send
          </button>
        </div>
      </div>
      <div style={styles.timelineSection}>
        <h3 style={styles.timelineHeader}>📜 Our Love Story</h3>
        <ul style={styles.timeline}>
          {timeline.map((item, index) => (
            <li key={index} style={styles.timelineItem}>
              <span style={styles.timelineDate}>{item.date}</span>
              <span style={styles.timelineEvent}>{item.event}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    gap: "20px",
    padding: "20px",
    fontFamily: "'Caveat', cursive",
    background: "linear-gradient(135deg, #ff758c, #ff7eb3)",
    borderRadius: "15px",
    boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.1)",
    color: "#fff",
  },
  chatSection: {
    flex: 2,
    background: "#fff",
    borderRadius: "15px",
    padding: "15px",
    boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
    color: "#000",
  },
  chatWindow: {
    height: "400px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    backgroundColor: "#f9f9f9",
    borderRadius: "15px",
    padding: "10px",
  },
  header: {
    fontSize: "1.8rem",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: "15px",
  },
  bubble: {
    padding: "10px 15px",
    maxWidth: "70%",
    borderRadius: "25px",
    fontSize: "1rem",
    lineHeight: "1.4",
    wordBreak: "break-word",
    position: "relative",
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "linear-gradient(135deg, #ff9a9e, #fad0c4)",
    color: "#fff",
    borderRadius: "20px 20px 0 20px",
  },
  otherBubble: {
    alignSelf: "flex-start",
    background: "linear-gradient(135deg, #a18cd1, #fbc2eb)",
    color: "#fff",
    borderRadius: "20px 20px 20px 0",
  },
  text: {
    margin: 0,
    fontSize: "1.2rem",
  },
  inputSection: {
    display: "flex",
    marginTop: "10px",
  },
  input: {
    flexGrow: 1,
    padding: "10px",
    border: "1px solid #ccc",
    borderRadius: "15px",
    marginRight: "10px",
    fontSize: "1rem",
  },
  sendButton: {
    padding: "10px 15px",
    backgroundColor: "#ff758c",
    color: "#fff",
    border: "none",
    borderRadius: "15px",
    fontSize: "1rem",
    cursor: "pointer",
    boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.2)",
  },
  timelineSection: {
    flex: 1,
    background: "#fff",
    borderRadius: "15px",
    padding: "15px",
    boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
    color: "#000",
  },
  timelineHeader: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: "15px",
  },
  timeline: {
    listStyle: "none",
    padding: 0,
  },
  timelineItem: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    marginBottom: "15px",
    padding: "10px",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #fad0c4, #ffd1ff)",
    boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
  },
  timelineDate: {
    fontWeight: "bold",
    fontSize: "1rem",
    color: "#ff758c",
  },
  timelineEvent: {
    fontSize: "1rem",
  },
};

export default RomanticChatWithTimeline;
