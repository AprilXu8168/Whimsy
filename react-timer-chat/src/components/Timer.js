// src/components/Timer.js
import React, { useState, useEffect } from "react";

const Timer = ({ startDate }) => {
  const [timeElapsed, setTimeElapsed] = useState({
    years: 0,
    months: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const calculateTimeElapsed = () => {
      const now = new Date();
      const start = new Date(startDate);

      let years = now.getFullYear() - start.getFullYear();
      let months = now.getMonth() - start.getMonth();
      let days = now.getDate() - start.getDate();
      let hours = now.getHours() - start.getHours();
      let minutes = now.getMinutes() - start.getMinutes();
      let seconds = now.getSeconds() - start.getSeconds();

      // Adjust for negative values
      if (seconds < 0) {
        seconds += 60;
        minutes -= 1;
      }
      if (minutes < 0) {
        minutes += 60;
        hours -= 1;
      }
      if (hours < 0) {
        hours += 24;
        days -= 1;
      }
      if (days < 0) {
        const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        days += daysInPrevMonth;
        months -= 1;
      }
      if (months < 0) {
        months += 12;
        years -= 1;
      }

      setTimeElapsed({ years, months, days, hours, minutes, seconds });
    };

    calculateTimeElapsed(); // Calculate immediately
    const timerId = setInterval(calculateTimeElapsed, 1000); // Update every second

    return () => clearInterval(timerId); // Cleanup interval
  }, [startDate]);

  const formatTimeString = () => {
    const { years, months, days, hours, minutes, seconds } = timeElapsed;

    const parts = [
      years > 0 ? `${years} year${years > 1 ? "s" : ""}` : "",
      months > 0 ? `${months} month${months > 1 ? "s" : ""}` : "",
      days > 0 ? `${days} day${days > 1 ? "s" : ""}` : "",
      hours > 0 ? `${hours} hour${hours > 1 ? "s" : ""}` : "",
      minutes > 0 ? `${minutes} min${minutes > 1 ? "s" : ""}` : "",
      seconds > 0 ? `${seconds} second${seconds > 1 ? "s" : ""}` : "",
    ];

    // Join non-empty parts with commas
    return parts.filter(Boolean).join(", ");
  };

  return (
    <div style={styles.container}>
      <div style={styles.timer}>{formatTimeString()}</div>
    </div>
  );
};

const styles = {
  container: {
    textAlign: "center",
    margin: "20px",
    fontFamily: "Arial, sans-serif",
  },
  timer: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    color: "#4CAF50",
  },
};

export default Timer;
