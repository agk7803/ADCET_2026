import os
import time
import logging
import io
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
from backend.services import db_service
from backend.core import config

logger = logging.getLogger("itms.report_service")

class ReportGenerator:
    def __init__(self):
        self.reports_dir = os.path.join(config.STORAGE_DIR, "Reports")
        os.makedirs(self.reports_dir, exist_ok=True)

    def generate_session_report(self, session_id: int) -> str:
        """Generate a PDF report for a specific session and return the file path."""
        session = db_service.db.get_session_summary(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        telemetry = db_service.db.get_session_telemetry(session_id)
        if not telemetry:
            # Create a minimal report if no telemetry exists
            telemetry = []

        report_filename = f"Inspection_Report_Session_{session_id}_{int(time.time())}.pdf"
        report_path = os.path.join(self.reports_dir, report_filename)

        doc = SimpleDocTemplate(report_path, pagesize=letter)
        styles = getSampleStyleSheet()
        elements = []

        # Title
        title_style = styles['Heading1']
        title_style.alignment = 1 # Center
        elements.append(Paragraph(f"Railway Inspection Report", title_style))
        elements.append(Spacer(1, 12))
        elements.append(Paragraph(f"Session ID: {session_id}", styles['Heading2']))
        elements.append(Spacer(1, 24))

        # Section 1: Session Summary
        elements.append(Paragraph("1. Session Summary", styles['Heading2']))
        start_time = datetime.fromtimestamp(session['start_time']).strftime('%Y-%m-%d %H:%M:%S')
        end_time = datetime.fromtimestamp(session['end_time']).strftime('%Y-%m-%d %H:%M:%S') if session['end_time'] else "N/A"
        
        summary_data = [
            ["Start Time", start_time],
            ["End Time", end_time],
            ["Data Source", session['data_source']],
            ["Total Distance (m)", f"{session['total_distance']:.3f}"],
            ["Data Points", len(telemetry)]
        ]
        
        t = Table(summary_data, colWidths=[150, 300])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('GRID', (0,0), (-1,-1), 1, colors.black),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 24))

        # Section 2: Sensor Analysis (Charts)
        if telemetry:
            elements.append(Paragraph("2. Sensor Analysis", styles['Heading2']))
            
            # Extract data
            timestamps = [t['timestamp'] - session['start_time'] for t in telemetry]
            robot_y = [t['robot_y'] or 0 for t in telemetry]
            
            # --- Chart 1: Movement Profile ---
            chart_path_movement = self._generate_movement_chart(session_id, timestamps, robot_y)
            if chart_path_movement:
                elements.append(Image(chart_path_movement, width=500, height=220))
                elements.append(Spacer(1, 12))

            # --- Chart 2: Lidar/Structure Profile ---
            l1 = [t['lidar1'] for t in telemetry]
            l2 = [t['lidar2'] for t in telemetry]
            l3 = [t['lidar3'] for t in telemetry]
            chart_path_lidar = self._generate_lidar_chart(session_id, robot_y, l1, l2, l3)
            if chart_path_lidar:
                elements.append(Image(chart_path_lidar, width=500, height=220))
                elements.append(Spacer(1, 12))

            # --- Chart 3: Acceleration/Vibration ---
            ax = [t['ax'] for t in telemetry]
            ay = [t['ay'] for t in telemetry]
            az = [t['az'] for t in telemetry]
            chart_path_accel = self._generate_accel_chart(session_id, robot_y, ax, ay, az)
            if chart_path_accel:
                elements.append(Image(chart_path_accel, width=500, height=220))
                elements.append(Spacer(1, 12))
                
            # --- Chart 4: Track Gauge ---
            gauge = [t['gauge'] for t in telemetry]
            chart_path_gauge = self._generate_gauge_chart(session_id, robot_y, gauge)
            if chart_path_gauge:
                elements.append(Image(chart_path_gauge, width=500, height=220))
                elements.append(Spacer(1, 12))
            
            # Add Lidar Measurements Table / Summary
            elements.append(PageBreak())
            elements.append(Paragraph("3. Track Profile Summary", styles['Heading2']))
            avg_l1 = np.mean([l for l in l1 if l is not None]) if any(l is not None for l in l1) else 0
            avg_l2 = np.mean([l for l in l2 if l is not None]) if any(l is not None for l in l2) else 0
            avg_l3 = np.mean([l for l in l3 if l is not None]) if any(l is not None for l in l3) else 0
            avg_gauge = np.mean([g for g in gauge if g is not None]) if any(g is not None for g in gauge) else 0
            
            lidar_data = [
                ["Metric", "Average Value"],
                ["Left Clearance (L1)", f"{avg_l1:.3f} m"],
                ["Right Clearance (L2)", f"{avg_l2:.3f} m"],
                ["Top Clearance (L3)", f"{avg_l3:.3f} m"],
                ["Track Gauge", f"{avg_gauge:.1f} px"]
            ]
            t_lidar = Table(lidar_data, colWidths=[200, 150])
            t_lidar.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (1, 0), colors.whitesmoke),
                ('GRID', (0,0), (-1,-1), 1, colors.black),
                ('PADDING', (0,0), (-1,-1), 6),
            ]))
            elements.append(t_lidar)
            elements.append(Spacer(1, 24))

        # Build PDF
        doc.build(elements)
        logger.info(f"Report generated: {report_path}")
        return report_path

    # --- Chart Generators ---

    def _clean_data(self, x, y):
        """Filter out None values from pairs."""
        return zip(*[(xi, yi) for xi, yi in zip(x, y) if xi is not None and yi is not None])

    def _generate_movement_chart(self, session_id: int, x_data, y_data) -> str:
        plt.figure(figsize=(10, 4))
        plt.plot(x_data, y_data, label='Distance (m)', color='blue', linewidth=1.5)
        plt.title(f'Movement Profile')
        plt.xlabel('Time (s)')
        plt.ylabel('Chainage (m)')
        plt.grid(True, linestyle='--', alpha=0.7)
        plt.legend()
        plt.tight_layout()
        path = os.path.join(self.reports_dir, f"chart_mov_{session_id}_{int(time.time())}.png")
        plt.savefig(path)
        plt.close()
        return path

    def _generate_lidar_chart(self, session_id: int, distance, l1, l2, l3) -> str:
        plt.figure(figsize=(10, 4))
        
        d1, v1 = self._clean_data(distance, l1)
        if d1: plt.plot(d1, v1, label='Left (L1)', color='orange', alpha=0.8, linewidth=1)
        
        d2, v2 = self._clean_data(distance, l2)
        if d2: plt.plot(d2, v2, label='Right (L2)', color='blue', alpha=0.8, linewidth=1)
        
        d3, v3 = self._clean_data(distance, l3)
        if d3: plt.plot(d3, v3, label='Top (L3)', color='red', alpha=0.8, linewidth=1)

        plt.title(f'Structure Clearances (Lidar)')
        plt.xlabel('Chainage (m)')
        plt.ylabel('Clearance (m)')
        plt.grid(True, linestyle='--', alpha=0.7)
        plt.legend()
        plt.tight_layout()
        path = os.path.join(self.reports_dir, f"chart_lidar_{session_id}_{int(time.time())}.png")
        plt.savefig(path)
        plt.close()
        return path

    def _generate_accel_chart(self, session_id: int, distance, ax, ay, az) -> str:
        plt.figure(figsize=(10, 4))
        
        d1, v1 = self._clean_data(distance, ax)
        if d1: plt.plot(d1, v1, label='Acc X', color='tomato', alpha=0.7, linewidth=0.5)
        
        d2, v2 = self._clean_data(distance, ay)
        if d2: plt.plot(d2, v2, label='Acc Y', color='mediumseagreen', alpha=0.7, linewidth=0.5)
        
        d3, v3 = self._clean_data(distance, az)
        if d3: plt.plot(d3, v3, label='Acc Z', color='royalblue', alpha=0.7, linewidth=0.5)

        plt.title(f'Vehicle Vibrations (Acceleration)')
        plt.xlabel('Chainage (m)')
        plt.ylabel('Acceleration (g)')
        plt.grid(True, linestyle='--', alpha=0.7)
        plt.legend()
        plt.tight_layout()
        path = os.path.join(self.reports_dir, f"chart_accel_{session_id}_{int(time.time())}.png")
        plt.savefig(path)
        plt.close()
        return path

    def _generate_gauge_chart(self, session_id: int, distance, gauge) -> str:
        plt.figure(figsize=(10, 4))
        
        d1, v1 = self._clean_data(distance, gauge)
        if d1: plt.plot(d1, v1, label='Gauge (px)', color='purple', linewidth=1)

        plt.title(f'Track Gauge Profile')
        plt.xlabel('Chainage (m)')
        plt.ylabel('Gauge (Pixels)')
        plt.grid(True, linestyle='--', alpha=0.7)
        plt.legend()
        plt.tight_layout()
        path = os.path.join(self.reports_dir, f"chart_gauge_{session_id}_{int(time.time())}.png")
        plt.savefig(path)
        plt.close()
        return path

# Global singleton
report_gen = ReportGenerator()
