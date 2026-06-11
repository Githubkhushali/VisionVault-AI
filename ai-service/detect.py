from ultralytics import YOLO

# Load YOLO model
model = YOLO("yolov8n.pt")

# Analyze image
results = model("person.png")

person_found = False

for result in results:
    for box in result.boxes:
        class_id = int(box.cls[0])

        # YOLO class 0 = Person
        if class_id == 0:
            person_found = True

if person_found:
    print("✅ Person Detected")
else:
    print("❌ No Person Found")