import cv2

def list_ports():
    is_working = True
    dev_port = 0
    working_ports = []
    available_ports = []
    while dev_port < 4:
        camera = cv2.VideoCapture(dev_port, cv2.CAP_DSHOW)
        if not camera.isOpened():
            is_working = False
            # Try without DSHOW
            camera = cv2.VideoCapture(dev_port)
            if camera.isOpened():
                is_working = True
            else:
                is_working = False
        
        if is_working:
            print(f"Port {dev_port} is working.")
            working_ports.append(dev_port)
            ret, frame = camera.read()
            if ret:
                print(f"  - Read frame successfully: {frame.shape}")
            else:
                print(f"  - Opened but failed to read frame")
            camera.release()
        else:
            print(f"Port {dev_port} is NOT working.")
        
        dev_port += 1
    return working_ports

if __name__ == "__main__":
    print("Scanning for cameras...")
    ports = list_ports()
    print(f"\nFound working camera indices: {ports}")
