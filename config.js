// RUDRAAS ARGUS Configuration
const CONFIG = {
  GOOGLE_MAPS_API_KEY: "AIzaSyAT7SpkR9almFff_IaF_6mLwZL6ujQkgoQ",
  get TILES_URL() {
    return `https://tile.googleapis.com/v1/3dtiles/root.json?key=${this.GOOGLE_MAPS_API_KEY}`;
  }
};
