with (import <nixpkgs> {});

stdenv.mkDerivation {
  name = "nodejs-setup";
  buildInputs = [
    nodejs
    tilt
    skaffold
    ngrok
# kubectl, part of docker
  ];
  shellHook = ''
    export PATH="$PWD/node_modules/.bin/:$PATH"
  '';
  
}

